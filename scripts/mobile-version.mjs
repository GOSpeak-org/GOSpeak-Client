#!/usr/bin/env node
// 移动端版本号同步：把 .github/versions/mobile.yaml 的声明写入原生工程。
//
// 单一事实源是 mobile.yaml；package.json / build.gradle / pbxproj / web package.json
// 都是它的派生副本，由本脚本统一写入，check-version.mjs 负责校验漂移。
//
// 用法：node scripts/mobile-version.mjs [rootDir]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)/;

/** 1.0.3 -> 10003，保证 versionCode 随 semver 单调递增。 */
export function androidVersionCode(version) {
	const match = SEMVER.exec(String(version).trim());
	if (!match) throw new Error(`invalid SemVer for versionCode: ${version}`);
	const major = Number(match[1]);
	const minor = Number(match[2]);
	const patch = Number(match[3]);
	return major * 10000 + minor * 100 + patch;
}

function readDeclared(rootDir) {
	const raw = readFileSync(`${rootDir}/.github/versions/mobile.yaml`, "utf8");
	const match = raw.match(/^version:\s*["']?([^\s#"']+)["']?\s*(?:#.*)?$/m);
	if (!match) throw new Error("mobile.yaml must declare a top-level version");
	return match[1];
}

function replaceAll(path, regex, replacement) {
	const raw = readFileSync(path, "utf8");
	const next = raw.replace(regex, replacement);
	if (next !== raw) writeFileSync(path, next);
}

/** 把声明版本写入所有派生副本。 */
export function syncMobileVersion(rootDir) {
	const version = readDeclared(rootDir);
	const code = androidVersionCode(version);

	replaceAll(
		`${rootDir}/mobile/package.json`,
		/("version":\s*)"[^"]*"/g,
		`$1"${version}"`,
	);
	replaceAll(
		`${rootDir}/mobile/android/app/build.gradle`,
		/versionCode\s+\d+/g,
		`versionCode ${code}`,
	);
	replaceAll(
		`${rootDir}/mobile/android/app/build.gradle`,
		/versionName\s+"[^"]*"/g,
		`versionName "${version}"`,
	);
	replaceAll(
		`${rootDir}/mobile/ios/App/App.xcodeproj/project.pbxproj`,
		/MARKETING_VERSION = [^;]+;/g,
		`MARKETING_VERSION = ${version};`,
	);
	replaceAll(
		`${rootDir}/mobile/ios/App/App.xcodeproj/project.pbxproj`,
		/CURRENT_PROJECT_VERSION = [^;]+;/g,
		`CURRENT_PROJECT_VERSION = ${code};`,
	);
	// app/web/package.json 的 version 注入 __APP_VERSION__，设置页与日志版本头共用。
	replaceAll(
		`${rootDir}/web/package.json`,
		/("version":\s*)"[^"]*"/g,
		`$1"${version}"`,
	);
	if (
		!/"version":\s*"/.test(readFileSync(`${rootDir}/web/package.json`, "utf8"))
	) {
		const raw = readFileSync(`${rootDir}/web/package.json`, "utf8");
		writeFileSync(
			`${rootDir}/web/package.json`,
			raw.replace(/\{\s*/, `{\n  "version": "${version}",`),
		);
	}
	return { version, code };
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	// 默认根目录取本脚本所在目录的上一级（仓库根），不要用 process.cwd()：
	// pnpm --filter 会在包目录（app/mobile）下执行脚本，用 cwd 会去找
	// app/mobile/.github/versions/mobile.yaml 而报 ENOENT。
	const root =
		process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
	const { version, code } = syncMobileVersion(root);
	console.log(
		`mobile version synced: ${version} (android versionCode ${code})`,
	);
}
