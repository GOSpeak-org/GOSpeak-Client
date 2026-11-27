import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { androidVersionCode, syncMobileVersion } from "./mobile-version.mjs";

test("androidVersionCode derives from semver", () => {
	assert.equal(androidVersionCode("1.0.3"), 10003);
	assert.equal(androidVersionCode("2.14.7"), 21407);
	assert.throws(() => androidVersionCode("oops"));
});

test("syncMobileVersion writes all derived copies", () => {
	const root = mkdtempSync(join(tmpdir(), "gospeak-mobile-sync-"));
	mkdirSync(join(root, ".github", "versions"), { recursive: true });
	writeFileSync(
		join(root, ".github", "versions", "mobile.yaml"),
		'version: "2.3.4"\n',
	);
	mkdirSync(join(root, "mobile", "android", "app"), { recursive: true });
	mkdirSync(join(root, "mobile", "ios", "App", "App.xcodeproj"), {
		recursive: true,
	});
	mkdirSync(join(root, "web"), { recursive: true });
	writeFileSync(
		join(root, "mobile", "package.json"),
		'{\n  "name": "@gospeak/mobile",\n  "version": "1.0.0"\n}\n',
	);
	writeFileSync(
		join(root, "mobile", "android", "app", "build.gradle"),
		'versionCode 1\nversionName "1.0"\n',
	);
	writeFileSync(
		join(root, "mobile", "ios", "App", "App.xcodeproj", "project.pbxproj"),
		"MARKETING_VERSION = 1.0;\nCURRENT_PROJECT_VERSION = 1;\n",
	);
	writeFileSync(
		join(root, "web", "package.json"),
		'{\n  "name": "@gospeak/web"\n}\n',
	);

	const result = syncMobileVersion(root);
	assert.deepEqual(result, { version: "2.3.4", code: 20304 });
	assert.match(
		readFileSync(join(root, "mobile", "package.json"), "utf8"),
		/"version": "2.3.4"/,
	);
	assert.match(
		readFileSync(
			join(root, "mobile", "android", "app", "build.gradle"),
			"utf8",
		),
		/versionCode 20304/,
	);
	assert.match(
		readFileSync(
			join(root, "mobile", "android", "app", "build.gradle"),
			"utf8",
		),
		/versionName "2.3.4"/,
	);
	assert.match(
		readFileSync(
			join(root, "mobile", "ios", "App", "App.xcodeproj", "project.pbxproj"),
			"utf8",
		),
		/MARKETING_VERSION = 2.3.4;/,
	);
	assert.match(
		readFileSync(
			join(root, "mobile", "ios", "App", "App.xcodeproj", "project.pbxproj"),
			"utf8",
		),
		/CURRENT_PROJECT_VERSION = 20304;/,
	);
	assert.match(
		readFileSync(join(root, "web", "package.json"), "utf8"),
		/"version": "2.3.4"/,
	);
});
