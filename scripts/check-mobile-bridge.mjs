#!/usr/bin/env node
// 校验移动端**自定义原生插件**的桥接契约：TS 侧 pluginMethod("Plugin", "method") 必须与
// 原生侧插件名 + 方法名逐字一致（iOS jsName/CAPPluginMethod、Android @CapacitorPlugin/@PluginMethod）。
// 范围仅限本仓库自己写的原生实现（见下方 CUSTOM_PLUGINS：AudioSession / MediaControl / ServerConfig）；
// push / keyboard / local-notification / deeplink / back-button / lifecycle 走官方 Capacitor 插件，
// 本地没有原生实现可比对，因此不在校验范围内——不要为「更全面」而扩白名单。
// 拼错时运行期只会得到 "not implemented"，多数能力会静默吞掉，因此在 CI 拦截。
// iOS 与 Android 分开比对：任一平台缺失即失败；iOS 只看真正参与编译的文件。
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const TS_DIR = "packages/mobile-capabilities/src/capabilities";
const IOS_DIR = "mobile/ios/App/App";
const IOS_PROJECT = "mobile/ios/App/App.xcodeproj/project.pbxproj";
const ANDROID_DIR = "mobile/android/app/src/main/java/dev/gospeak/mobile";
const IOS_SOURCE_EXTENSIONS = [".swift", ".m"];

export function extractTsMethods(files) {
	const methods = new Set();
	for (const file of files) {
		for (const m of file.source.matchAll(
			/pluginMethod\(\s*"([A-Z]\w*)"\s*,\s*"([A-Za-z]\w*)"\s*\)/g,
		)) {
			methods.add(`${m[1]}.${m[2]}`);
		}

		const pluginNames = [
			...file.source.matchAll(/getPlugin<[^>]*>\(\s*"([A-Z]\w*)"/g),
		].map((m) => m[1]);
		for (const plugin of pluginNames) {
			// 直接调用：plugin.list() / plugin.set(...)
			for (const m of file.source.matchAll(/\bplugin\.([A-Za-z]\w*)\s*\(/g)) {
				methods.add(`${plugin}.${m[1]}`);
			}
			// 动态调用：const call = async (method: "activate" | "deactivate")
			for (const m of file.source.matchAll(
				/method:\s*"([A-Za-z]\w*)"\s*\|\s*"([A-Za-z]\w*)"/g,
			)) {
				methods.add(`${plugin}.${m[1]}`);
				methods.add(`${plugin}.${m[2]}`);
			}
		}
	}
	return methods;
}

export function extractSwiftMethods(files) {
	const methods = new Set();
	for (const file of files) {
		const nameMatch = file.source.match(/jsName\s*=\s*"([A-Z]\w*)"/);
		if (!nameMatch) continue;
		const plugin = nameMatch[1];
		for (const m of file.source.matchAll(
			/CAPPluginMethod\(\s*name:\s*"([A-Za-z]\w*)"/g,
		)) {
			methods.add(`${plugin}.${m[1]}`);
		}
	}
	return methods;
}

export function extractObjcMethods(files) {
	const methods = new Set();
	for (const file of files) {
		for (const plugin of file.source.matchAll(
			/CAP_PLUGIN\(\s*\w+\s*,\s*"([A-Za-z]\w*)"/g,
		)) {
			const start = plugin.index + plugin[0].length;
			const end = file.source.indexOf("\n)", start);
			if (end < 0) continue;
			const block = file.source.slice(start, end);
			for (const m of block.matchAll(
				/CAP_PLUGIN_METHOD\(\s*([A-Za-z]\w*)\s*,/g,
			)) {
				methods.add(`${plugin[1]}.${m[1]}`);
			}
		}
	}
	return methods;
}

export function extractKotlinMethods(files) {
	const methods = new Set();
	for (const file of files) {
		const nameMatch = file.source.match(
			/@CapacitorPlugin\(\s*name\s*=\s*"([A-Z]\w*)"/,
		);
		if (!nameMatch) continue;
		const plugin = nameMatch[1];
		for (const m of file.source.matchAll(
			/@PluginMethod\s*(?:\r?\n\s*)*fun\s+([A-Za-z]\w*)\s*\(/g,
		)) {
			methods.add(`${plugin}.${m[1]}`);
		}
	}
	return methods;
}

export function extractJavaMethods(files) {
	const methods = new Set();
	for (const file of files) {
		const nameMatch = file.source.match(
			/@CapacitorPlugin\(\s*name\s*=\s*"([A-Z]\w*)"/,
		);
		if (!nameMatch) continue;
		const plugin = nameMatch[1];
		for (const m of file.source.matchAll(
			/@PluginMethod\s*(?:\r?\n\s*)*(?:public\s+)?(?:static\s+)?void\s+([A-Za-z]\w*)\s*\(/g,
		)) {
			methods.add(`${plugin}.${m[1]}`);
		}
	}
	return methods;
}

export function checkMethods({ ts, native }) {
	const missing = [...ts].filter((m) => !native.has(m)).sort();
	const unused = [...native].filter((m) => !ts.has(m)).sort();
	return { missing, unused, ok: missing.length === 0 };
}

export function extractRegisteredPlugins(source, platform) {
	const plugins = new Set();
	if (platform === "swift") {
		const classToName = new Map();
		for (const match of source.matchAll(
			/(?:public\s+)?class\s+(\w+)[^{]*\{[\s\S]*?jsName\s*=\s*"([A-Z]\w*)"/g,
		)) {
			classToName.set(match[1], match[2]);
		}
		for (const match of source.matchAll(
			/bridge\.plugin\(withName:\s*"([A-Za-z]\w*)"\)\s*==\s*nil\s*\{[^{}]*?bridge\.registerPluginInstance\(\s*(\w+)\(\)\s*\)/g,
		)) {
			plugins.add(match[1]);
			const name = classToName.get(match[2]);
			if (name) plugins.add(name);
		}
	} else if (platform === "java") {
		for (const pattern of [
			/registerPlugin\(\s*new\s+(\w+)\(\)\s*\)/g,
			/registerPlugin\(\s*(\w+)\.class\s*\)/g,
		]) {
			for (const match of source.matchAll(pattern)) {
				plugins.add(match[1].replace(/Plugin$/, ""));
			}
		}
	}
	return plugins;
}

export function checkPluginRegistration({ declared, ios, android }) {
	return {
		iosMissing: [...declared].filter((p) => !ios.has(p)).sort(),
		androidMissing: [...declared].filter((p) => !android.has(p)).sort(),
	};
}

function readDir(dir, extensions) {
	try {
		return readdirSync(dir)
			.filter((f) => extensions.some((ext) => f.endsWith(ext)))
			.map((f) => ({
				path: join(dir, f),
				source: readFileSync(join(dir, f), "utf8"),
			}));
	} catch {
		return [];
	}
}

const PBX_OBJECT_RE = /^\t\t([0-9A-F]{24})[^=\n]*=\s*\{/;

export function parsePbxObjects(text) {
	const start = text.indexOf("objects = {");
	if (start < 0) throw new Error("pbxproj: 找不到 objects 段，无法解析");
	const objects = new Map();
	let id = null;
	let depth = 0;
	let body = [];
	for (const line of text.slice(start).split("\n")) {
		if (id === null) {
			const m = PBX_OBJECT_RE.exec(line);
			if (!m) continue;
			id = m[1];
			depth = 0;
			body = [];
		}
		body.push(line);
		depth += line.split("{").length - 1 - (line.split("}").length - 1);
		if (depth <= 0) {
			objects.set(id, body.join("\n"));
			id = null;
		}
	}
	if (objects.size === 0) throw new Error("pbxproj: 没有解析出任何对象");
	return objects;
}

function pbxValue(body, key) {
	const m = new RegExp(`\\b${key}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*"|[^;]*);`).exec(
		body,
	);
	if (!m) return undefined;
	const raw = m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim();
	return raw.startsWith('"') ? raw.slice(1, -1) : raw;
}

function pbxList(body, key) {
	const marker = `${key} = (`;
	const idx = body.indexOf(marker);
	if (idx < 0) return null;
	const start = idx + marker.length;
	const end = body.indexOf(");", start);
	if (end < 0) throw new Error(`pbxproj: ${key} 列表未闭合`);
	return [...body.slice(start, end).matchAll(/([0-9A-F]{24})\b/g)].map(
		(m) => m[1],
	);
}

// 从 pbxproj 的 PBXSourcesBuildPhase 反推参与编译的源码文件；解析失败直接抛错，
// 不回退成「目录里所有文件都算已实现」。
export function iosCompiledSources(root = ".") {
	const projectFile = join(root, IOS_PROJECT);
	if (!existsSync(projectFile)) {
		throw new Error(`pbxproj 不存在: ${IOS_PROJECT}`);
	}
	const objects = parsePbxObjects(readFileSync(projectFile, "utf8"));
	const projectDir = dirname(dirname(projectFile));

	const buildFileRefs = new Map();
	const fileRefs = new Map();
	const groups = new Map();
	let project = null;
	for (const [id, body] of objects) {
		switch (pbxValue(body, "isa")) {
			case "PBXBuildFile": {
				const ref = pbxValue(body, "fileRef");
				if (ref) buildFileRefs.set(id, ref);
				break;
			}
			case "PBXFileReference":
				fileRefs.set(id, body);
				break;
			case "PBXGroup":
			case "PBXVariantGroup":
				groups.set(id, body);
				break;
			case "PBXProject":
				project = body;
				break;
		}
	}

	const sourceRefs = new Set();
	for (const body of objects.values()) {
		if (pbxValue(body, "isa") !== "PBXSourcesBuildPhase") continue;
		for (const buildFileId of pbxList(body, "files") ?? []) {
			const ref = buildFileRefs.get(buildFileId);
			if (!ref) {
				throw new Error(
					`pbxproj: Sources 阶段引用了未知 build file ${buildFileId}`,
				);
			}
			sourceRefs.add(ref);
		}
	}
	if (sourceRefs.size === 0) {
		throw new Error("pbxproj: PBXSourcesBuildPhase 没有编译任何文件");
	}

	const mainGroup = project && pbxValue(project, "mainGroup");
	if (!mainGroup || !groups.has(mainGroup)) {
		throw new Error("pbxproj: 找不到 mainGroup，无法解析文件路径");
	}

	// 沿 group 树还原每个文件引用在工程内的相对路径
	const paths = new Map();
	const walk = (groupId, prefix) => {
		const body = groups.get(groupId);
		if (!body) return;
		const base = ["SOURCE_ROOT", "<absolute>"].includes(
			pbxValue(body, "sourceTree") ?? "",
		)
			? []
			: prefix;
		const own = pbxValue(body, "path") ?? pbxValue(body, "name");
		const segments = own ? [...base, own] : base;
		for (const child of pbxList(body, "children") ?? []) {
			if (groups.has(child)) {
				walk(child, segments);
			} else if (fileRefs.has(child)) {
				paths.set(child, segments);
			}
		}
	};
	walk(mainGroup, []);

	const files = [];
	for (const refId of sourceRefs) {
		const segments = paths.get(refId);
		if (!segments) {
			throw new Error(`pbxproj: 编译文件 ${refId} 不在 mainGroup 树中`);
		}
		const file = pbxValue(fileRefs.get(refId), "path");
		if (!file) throw new Error(`pbxproj: 文件引用 ${refId} 缺少 path`);
		const abs = join(projectDir, ...segments, file);
		if (!IOS_SOURCE_EXTENSIONS.some((ext) => abs.endsWith(ext))) continue;
		if (!existsSync(abs)) {
			throw new Error(
				`pbxproj 声明的编译文件不存在: ${relative(root, abs) || abs}`,
			);
		}
		files.push({ path: abs, source: readFileSync(abs, "utf8") });
	}
	return files;
}

function collectIos(root) {
	if (!existsSync(join(root, IOS_DIR))) {
		return { name: "ios", dir: IOS_DIR, skipped: true };
	}
	const files = iosCompiledSources(root);
	return {
		name: "ios",
		dir: IOS_DIR,
		skipped: false,
		native: new Set([
			...extractSwiftMethods(files.filter((f) => f.path.endsWith(".swift"))),
			...extractObjcMethods(files.filter((f) => f.path.endsWith(".m"))),
		]),
	};
}

function collectAndroid(root) {
	const dir = join(root, ANDROID_DIR);
	if (!existsSync(dir)) {
		return { name: "android", dir: ANDROID_DIR, skipped: true };
	}
	return {
		name: "android",
		dir: ANDROID_DIR,
		skipped: false,
		native: new Set([
			...extractKotlinMethods(readDir(dir, [".kt"])),
			...extractJavaMethods(readDir(dir, [".java"])),
		]),
	};
}

// 仓库自有的自定义原生插件：只有这三个在 app/mobile/{ios,android} 里有对应的
// Swift / ObjC / Java 实现，其余移动能力复用官方 Capacitor 插件，本地无可比对的原生代码。
const CUSTOM_PLUGINS = new Set([
	"AudioSession",
	"MediaControl",
	"ServerConfig",
]);

export function checkRepo(root = ".") {
	const ts = new Set(
		[...extractTsMethods(readDir(join(root, TS_DIR), [".ts"]))].filter((m) =>
			CUSTOM_PLUGINS.has(m.split(".")[0]),
		),
	);
	const platforms = [collectIos(root), collectAndroid(root)].map((p) => {
		if (p.skipped) return { ...p, missing: [], unused: [] };
		const { missing, unused } = checkMethods({ ts, native: p.native });
		return { ...p, missing, unused };
	});
	const missing = platforms.flatMap((p) =>
		p.missing.map((m) => `${p.name}:${m}`),
	);
	const unused = platforms.flatMap((p) =>
		p.unused.map((m) => `${p.name}:${m}`),
	);
	const skipped = platforms.filter((p) => p.skipped).map((p) => p.name);
	return { ts, platforms, missing, unused, skipped, ok: missing.length === 0 };
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	let report;
	try {
		report = checkRepo(".");
	} catch (error) {
		console.error(
			`::error::${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}

	let failed = report.missing.length > 0;
	for (const platform of report.platforms) {
		if (platform.skipped) {
			// 目录缺失等于没校验，不能当作通过
			console.error(
				`::error::[${platform.name}] skipped（原生平台目录不存在: ${platform.dir}），桥接未校验`,
			);
			failed = true;
			continue;
		}
		for (const m of platform.unused) {
			console.warn(
				`::warning::[${platform.name}] 原生实现了但 TS 未调用: ${m}`,
			);
		}
		for (const m of platform.missing) {
			console.error(
				`::error::[${platform.name}] TS 调用了原生未实现的方法: ${m}`,
			);
		}
	}
	const declared = new Set(
		[...extractTsMethods(readDir(TS_DIR, [".ts"]))]
			.filter((m) => CUSTOM_PLUGINS.has(m.split(".")[0]))
			.map((m) => m.split(".")[0]),
	);
	const iosRegistered = new Set();
	for (const file of readDir(IOS_DIR, [".swift"])) {
		for (const plugin of extractRegisteredPlugins(file.source, "swift")) {
			iosRegistered.add(plugin);
		}
	}
	const androidMain = join(ANDROID_DIR, "MainActivity.java");
	const androidRegistered = extractRegisteredPlugins(
		existsSync(androidMain) ? readFileSync(androidMain, "utf8") : "",
		"java",
	);
	const registration = checkPluginRegistration({
		declared,
		ios: iosRegistered,
		android: androidRegistered,
	});
	for (const platform of [
		{
			name: "android",
			file: androidMain,
			missing: registration.androidMissing,
		},
		{
			name: "ios",
			file: join(IOS_DIR, "SceneDelegate.swift"),
			missing: registration.iosMissing,
		},
	]) {
		for (const plugin of platform.missing) {
			console.error(
				`::error::[${platform.name}] ${platform.file} 未注册插件: ${plugin}`,
			);
			failed = true;
		}
	}
	if (failed) process.exitCode = 1;
	else console.log("custom mobile plugin bridge methods are in sync");
}
