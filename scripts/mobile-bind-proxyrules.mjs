#!/usr/bin/env node
// gomobile 绑定门禁。gobind 不需要 Xcode / Android SDK，任何机器上都能跑，负责断言
// proxyrules 的导出函数确实进入了绑定产物；gomobile bind 只在平台工具链齐备时产出
// AAR / XCFramework，缺工具链属于已文档化的降级路径（exit 0）。
//
// gobind 遇到不支持的签名会静默跳过该函数、产物里只留一行
// "// skipped function <Name> with unsupported parameter or return types"，然后仍然
// exit 0。因此判定必须解析产物、断言符号集合，不能只看退出码。
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MODULE_DIR = "proxyrules";
export const OBJC_PREFIX = "Proxyrules";
export const OUTPUT_DIR = "mobile/build/proxyrules";
export const LANGUAGES = ["objc", "java"];
export const EXPORTED_FUNCTIONS = [
	"ValidateBaseURL",
	"NormalizeBaseURL",
	"RewriteSetCookie",
	"IsTrustedWorker",
	"NormalizedHostPort",
];

const GOMBILE_INSTALL = [
	"cd proxyrules && go mod download golang.org/x/mobile",
	"版本由 go.mod 的 tool 指令锁定，用 go tool gomobile bind ... 即可，无需全局安装",
];

export const ENVIRONMENT_RULES = [
	{
		id: "xcode",
		target: "ios",
		pattern: /requires xcode/i,
		summary: "缺少 Xcode（xcode-select 指向 CommandLineTools）",
		nextSteps: [
			"安装 Xcode：App Store 或 https://developer.apple.com/xcode/",
			"sudo xcode-select -s /Applications/Xcode.app/Contents/Developer",
			"重新运行 node scripts/mobile-bind-proxyrules.mjs --target=ios",
		],
	},
	{
		id: "android-sdk",
		target: "android",
		pattern: /could not locate android sdk|android sdk was not found/i,
		summary: "缺少 Android SDK",
		nextSteps: [
			"安装 Android SDK（Android Studio 或 command-line-tools-only）",
			'export ANDROID_HOME="$HOME/Library/Android/sdk"',
			"重新运行 node scripts/mobile-bind-proxyrules.mjs --target=android",
		],
	},
	{
		id: "android-ndk",
		target: "android",
		pattern:
			/could not locate android ndk|android ndk was not found|no ndk|ndk root|which is unusable|unsupported api version/i,
		summary: "Android NDK 不可用（缺失或 API 版本不受支持）",
		nextSteps: [
			'sdkmanager --install "ndk;27.0.12077973"',
			'export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"',
			"重新运行 node scripts/mobile-bind-proxyrules.mjs --target=android",
		],
	},
	{
		id: "java",
		target: "android",
		pattern:
			/(?:javac|java)(?:\.home)?[^\n]*(?:not found|not set|is not available)|unable to locate a java runtime/i,
		summary: "缺少 JDK（gomobile bind -target=android 需要 javac）",
		nextSteps: [
			"安装 JDK 21（Temurin 或系统 OpenJDK）",
			"export JAVA_HOME=$(/usr/libexec/java_home -v 21)",
			"重新运行 node scripts/mobile-bind-proxyrules.mjs --target=android",
		],
	},
];

/** 判定 gomobile bind 的失败属于「环境不具备」还是「绑定真的坏了」。 */
export function classifyGomobileFailure(stderr, target) {
	const text = String(stderr ?? "");
	for (const rule of ENVIRONMENT_RULES) {
		if (rule.target && rule.target !== target) continue;
		if (!rule.pattern.test(text)) continue;
		return {
			kind: "environment-missing",
			id: rule.id,
			summary: rule.summary,
			detail: firstLine(text),
			nextSteps: rule.nextSteps,
		};
	}
	return {
		kind: "failure",
		id: "unknown",
		summary: "gomobile bind 失败",
		detail: text.trim() || "(无输出)",
		nextSteps: [],
	};
}

export function firstLine(text) {
	const line = String(text ?? "")
		.split("\n")
		.map((s) => s.trim())
		.find((s) => s.length > 0);
	return line ?? "";
}

export function lowerFirst(name) {
	return name.length === 0 ? name : name[0].toLowerCase() + name.slice(1);
}

/** 解析 Objective-C 头文件的 FOUNDATION_EXPORT 行，返回去掉包前缀后的函数名。 */
export function parseObjcExports(header, prefix = OBJC_PREFIX) {
	const names = new Set();
	for (const m of header.matchAll(
		/^\s*FOUNDATION_EXPORT\b[^(]*?(\w+)\s*\(/gm,
	)) {
		const symbol = m[1];
		names.add(
			prefix && symbol.startsWith(prefix)
				? symbol.slice(prefix.length)
				: symbol,
		);
	}
	return names;
}

/** 解析 gobind 生成的 Java 绑定类里的 public static native 方法。 */
export function parseJavaMethods(source) {
	const names = new Set();
	for (const m of source.matchAll(
		/^\s*public\s+static\s+native\b[^(]*?(\w+)\s*\(/gm,
	)) {
		names.add(m[1]);
	}
	return names;
}

export function parseSkippedFunctions(source) {
	const skipped = [];
	for (const m of source.matchAll(/\/\/\s*skipped function\s+([\w.]+)/g)) {
		skipped.push(m[1]);
	}
	return skipped;
}

/** 解析 Go 源码里导出的顶层函数，用于发现断言清单与包 API 的漂移。 */
export function parseExportedFunctions(source) {
	const names = new Set();
	for (const m of source.matchAll(/^func\s+([A-Z]\w*)\s*\(/gm)) names.add(m[1]);
	return names;
}

/** gobind 对 Java 侧的方法名会把首字母小写。 */
export function expectedSymbols(names, lang) {
	return lang === "java" ? names.map(lowerFirst) : [...names];
}

export function checkBindingSurface({
	exports,
	lang,
	expected = EXPORTED_FUNCTIONS,
}) {
	const want = expectedSymbols(expected, lang);
	const missing = want.filter((name) => !exports.has(name));
	return { lang, expected: want, missing, ok: missing.length === 0 };
}

// --surface-only：只跑 gobind 断言绑定面，完全不尝试 gomobile bind。
// 给"能在任何机器上跑、且必须在 gate 里跑"的场景用（例如 ubuntu 的 desktop-go），
// 那里没有 Xcode、NDK 也可能与 gomobile 的默认 API 不兼容，尝试 bind 只会制造假红。
export function wantsSurfaceOnly(argv) {
	return argv.includes("--surface-only");
}

export function parseTargets(argv) {
	const flag = argv.find((arg) => arg.startsWith("--target="));
	if (!flag) return ["ios", "android"];
	const value = flag.slice("--target=".length);
	if (value === "all") return ["ios", "android"];
	if (value === "ios" || value === "android") return [value];
	throw new Error(`未知的 --target=${value}，可选 all | android | ios`);
}

function run(command, args, { cwd, pathPrefix } = {}) {
	const env = { ...process.env };
	if (pathPrefix) env.PATH = `${pathPrefix}:${env.PATH ?? ""}`;
	const result = spawnSync(command, args, {
		cwd,
		env,
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
	});
	return {
		status: result.status ?? null,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		error: result.error ? result.error.message : null,
	};
}

function goEnv(cwd, key) {
	const result = run("go", ["env", key], { cwd });
	return result.status === 0 ? result.stdout.trim() : "";
}

function findOnPath(name, path = process.env.PATH ?? "") {
	for (const dir of path.split(":")) {
		if (!dir) continue;
		const candidate = join(dir, name);
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

/** 依次尝试 go.mod 的 tool 指令、GOBIN/GOPATH/bin、PATH。 */
function resolveTool(cwd, name) {
	const viaGo = run("go", ["tool", "-n", name], { cwd });
	if (viaGo.status === 0 && viaGo.stdout.trim()) {
		return { command: "go", args: ["tool", name], binary: viaGo.stdout.trim() };
	}
	const gobin = goEnv(cwd, "GOBIN") || join(goEnv(cwd, "GOPATH"), "bin");
	if (gobin) {
		const candidate = join(gobin, name);
		if (existsSync(candidate)) {
			return { command: candidate, args: [], binary: candidate };
		}
	}
	const onPath = findOnPath(name);
	if (onPath) return { command: onPath, args: [], binary: onPath };
	return null;
}

function findFiles(dir, predicate, acc = []) {
	if (!existsSync(dir)) return acc;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) findFiles(path, predicate, acc);
		else if (predicate(path, entry.name)) acc.push(path);
	}
	return acc;
}

function generateBindings({ root, moduleDir, gobind, lang, pathPrefix }) {
	const outDir = join(root, OUTPUT_DIR, lang);
	rmSync(outDir, { recursive: true, force: true });
	mkdirSync(outDir, { recursive: true });
	const result = run(
		gobind.command,
		[...gobind.args, `-lang=${lang}`, "-outdir", outDir, "."],
		{ cwd: moduleDir, pathPrefix },
	);

	const files = findFiles(
		outDir,
		(path) =>
			path.endsWith(".h") || path.endsWith(".java") || path.endsWith(".m"),
	);
	const skipped = [
		...new Set(
			files.flatMap((file) =>
				parseSkippedFunctions(readFileSync(file, "utf8")),
			),
		),
	];
	const bindingName =
		lang === "objc" ? `${OBJC_PREFIX}.objc.h` : `${OBJC_PREFIX}.java`;
	const target = findFiles(outDir, (_path, name) => name === bindingName)[0];

	let exports = new Set();
	if (target) {
		const source = readFileSync(target, "utf8");
		exports =
			lang === "objc"
				? parseObjcExports(source, OBJC_PREFIX)
				: parseJavaMethods(source);
	}

	return {
		lang,
		outDir,
		status: result.status,
		stderr: result.stderr,
		error: result.error,
		target: target ? relative(root, target) : null,
		exports,
		skipped,
		...checkBindingSurface({ exports, lang }),
	};
}

// gomobile 的 -androidapi 默认取 minAndroidAPI = 16，而现代 NDK 的 meta/platforms.json
// 只覆盖 21..35，不显式指定就会报 "unsupported API version 16" 而 bind 失败。
// 取 24 与 mobile/android 的 minSdkVersion 一致。
const ANDROID_API = 24;

function bindTarget({ root, moduleDir, gomobile, target, pathPrefix }) {
	const out =
		target === "ios"
			? join(root, OUTPUT_DIR, "Proxyrules.xcframework")
			: join(root, OUTPUT_DIR, "proxyrules.aar");
	rmSync(out, { recursive: true, force: true });
	const args = [...gomobile.args, "bind", `-target=${target}`];
	if (target === "android") args.push(`-androidapi=${ANDROID_API}`);
	args.push("-o", out, ".");
	const result = run(gomobile.command, args, { cwd: moduleDir, pathPrefix });
	return { target, out, ...result };
}

function printSteps(steps, indent = "        ") {
	// 走 stderr：这些步骤属于紧邻的 ::warning::/::error::，同流输出才不会在 CI 日志里
	// 被 stdout 的缓冲推到注解之前、与所属告警脱节。
	for (const step of steps) console.error(`${indent}- ${step}`);
}

function main(argv) {
	const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
	const moduleDir = join(root, MODULE_DIR);
	if (!existsSync(join(moduleDir, "go.mod"))) {
		console.error(`::error::找不到共享模块 ${MODULE_DIR}/go.mod`);
		return 1;
	}

	let targets;
	try {
		targets = parseTargets(argv);
	} catch (error) {
		console.error(`::error::${error.message}`);
		return 1;
	}

	let failed = false;
	const summary = [];

	const goVersion = run("go", ["version"], { cwd: moduleDir });
	if (goVersion.status !== 0) {
		console.error(
			"::error::未找到 go（需要 Go >= 1.26；GOTOOLCHAIN=auto 会按 go.mod 的 go 指令解析）: https://go.dev/dl/",
		);
		return 1;
	}

	const gobind = resolveTool(moduleDir, "gobind");
	if (!gobind) {
		console.error(
			"::error::gobind 不可用（go.mod 的 tool 指令、GOBIN 与 PATH 都拿不到），无法校验绑定面",
		);
		console.error(
			"::error::修复：cd proxyrules && go mod download golang.org/x/mobile",
		);
		return 1;
	}
	const gopathBin = goEnv(moduleDir, "GOPATH")
		? join(goEnv(moduleDir, "GOPATH"), "bin")
		: "";
	// gomobile bind 在检查 Xcode/SDK 之前先 exec.LookPath("gobind")，而 go tool 缓存的
	// 二进制目录里确实存在名为 gobind 的文件；不把该目录放进 PATH 会先报
	// "gobind was not found. Please run gomobile init"，把真正的环境结论盖掉。
	const pathPrefix = [dirname(gobind.binary), gopathBin]
		.filter(Boolean)
		.join(":");

	for (const lang of LANGUAGES) {
		const result = generateBindings({
			root,
			moduleDir,
			gobind,
			lang,
			pathPrefix,
		});
		if (result.error || result.status !== 0) {
			console.error(
				`::error::[gobind ${lang}] 失败（exit ${result.status}）: ${firstLine(result.stderr) || result.error}`,
			);
			if (result.stderr.trim()) console.error(result.stderr.trim());
			failed = true;
			continue;
		}
		if (!result.target) {
			console.error(
				`::error::[gobind ${lang}] 未生成 ${OBJC_PREFIX} 绑定文件（看到: ${result.outDir}）`,
			);
			failed = true;
			continue;
		}
		if (result.skipped.length > 0) {
			console.error(
				`::error::[gobind ${lang}] gobind 静默跳过了函数（签名不受支持）: ${result.skipped.join(", ")}`,
			);
			failed = true;
		}
		if (!result.ok) {
			console.error(
				`::error::[gobind ${lang}] 缺少导出符号: ${result.missing.join(", ")}`,
			);
			failed = true;
		}
		if (result.ok && result.skipped.length === 0) {
			console.log(
				`gobind ${lang}: ${result.expected.length}/${EXPORTED_FUNCTIONS.length} 导出函数已绑定（${relative(root, result.outDir)}）`,
			);
			summary.push(`gobind ${lang} ok`);
		}
	}

	const goSource = findFiles(
		moduleDir,
		(path) => path.endsWith(".go") && !path.endsWith("_test.go"),
	)
		.map((file) => readFileSync(file, "utf8"))
		.join("\n");
	const exported = parseExportedFunctions(goSource);
	const missingFromSource = EXPORTED_FUNCTIONS.filter((n) => !exported.has(n));
	const extraInSource = [...exported].filter(
		(n) => !EXPORTED_FUNCTIONS.includes(n),
	);
	if (missingFromSource.length > 0) {
		console.error(
			`::error::proxyrules 已不再导出: ${missingFromSource.join(", ")}，请更新本脚本的 EXPORTED_FUNCTIONS`,
		);
		failed = true;
	}
	if (extraInSource.length > 0) {
		console.warn(
			`::warning::proxyrules 新增了未纳入断言的导出函数: ${extraInSource.join(", ")}（如移动端需要请加进 EXPORTED_FUNCTIONS）`,
		);
	}

	const surfaceOnly = wantsSurfaceOnly(argv);
	let gomobile = null;
	if (surfaceOnly) {
		console.log("surface-only: 跳过 gomobile bind（只校验 gobind 绑定面）");
	} else {
		gomobile = resolveTool(moduleDir, "gomobile");
		if (!gomobile) {
			console.warn(
				"::warning::未找到 gomobile，跳过 gomobile bind（gobind 校验已独立完成）",
			);
			printSteps(GOMBILE_INSTALL);
			summary.push("gomobile bind skipped (gomobile 未安装)");
		}
	}
	for (const target of surfaceOnly ? [] : targets) {
		if (!gomobile) break;
		const result = bindTarget({
			root,
			moduleDir,
			gomobile,
			target,
			pathPrefix,
		});
		if (result.status === 0) {
			if (!existsSync(result.out)) {
				console.error(
					`::error::[${target}] gomobile bind 退出 0 但没有产出 ${relative(root, result.out)}`,
				);
				return 1;
			}
			console.log(
				`gomobile bind ${target}: 产物 ${relative(root, result.out)}`,
			);
			summary.push(`${target} ok`);
			continue;
		}
		const verdict = classifyGomobileFailure(
			`${result.stderr}\n${result.stdout}`,
			target,
		);
		if (verdict.kind === "environment-missing") {
			console.warn(
				`::warning::[${target}] 环境不具备（${verdict.id}）：${verdict.summary}`,
			);
			printSteps(verdict.nextSteps);
			summary.push(`${target} skipped (${verdict.id})`);
			continue;
		}
		console.error(
			`::error::[${target}] gomobile bind 失败，且不属于已知的工具链缺失: ${verdict.detail}`,
		);
		failed = true;
	}

	if (failed) {
		console.error("mobile bind gate failed");
		return 1;
	}
	console.log(
		`bind surface verified: ${EXPORTED_FUNCTIONS.length}/${EXPORTED_FUNCTIONS.length} functions`,
	);
	console.log(`summary: ${summary.join("; ")}`);
	return 0;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const code = main(process.argv.slice(2));
	process.exit(code);
}
