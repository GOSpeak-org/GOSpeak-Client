import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { checkRadiusTokens } from "./check-radius-tokens.mjs";
import { checkUiTokens } from "./check-ui-tokens.mjs";

const tempRoots = [];

function fixture(files) {
	const root = mkdtempSync(join(tmpdir(), "gospeak-ui-token-"));
	tempRoots.push(root);
	for (const [file, content] of Object.entries(files)) {
		const fullPath = join(root, file);
		mkdirSync(dirname(fullPath), { recursive: true });
		writeFileSync(fullPath, content, "utf8");
	}
	return root;
}

after(() => {
	for (const root of tempRoots) {
		rmSync(root, { recursive: true, force: true });
	}
});

test("裸 rounded-[4px] 命中圆角门禁", () => {
	const root = fixture({
		"web/src/probe.tsx": '<div className="rounded-[4px]" />\n',
	});
	const violations = checkRadiusTokens(root);
	assert.equal(violations.length, 1);
	assert.equal(violations[0].found, "rounded-[4px]");
	assert.equal(violations[0].line, 1);
});

test("CSS 里无空格的 border-radius:0.5rem 命中圆角门禁", () => {
	const root = fixture({
		"web/src/probe.css": ".x { border-radius:0.5rem; }\n",
	});
	const violations = checkRadiusTokens(root);
	assert.equal(violations.length, 1);
	assert.equal(violations[0].found, "border-radius:0.5rem");
});

test("带行高的任意字号在 CSS 与 tsx 中均命中", () => {
	const root = fixture({
		"web/src/probe.css": ".x { @apply text-[13px/20px]; }\n",
		"packages/components/src/probe.tsx":
			'<div className="text-[0.875rem/1.25rem]" />\n',
	});
	const violations = checkUiTokens(root);
	const found = violations.map((v) => `${v.file}:${v.found}`);
	assert.equal(violations.length, 2);
	assert.ok(found.includes("web/src/probe.css:text-[13px/20px]"));
	assert.ok(
		found.includes("packages/components/src/probe.tsx:text-[0.875rem/1.25rem]"),
	);
});

test("图标 size 属性乱序与跨行均命中", () => {
	const root = fixture({
		"web/src/probe.tsx": [
			'<Icon className="x" size={15} />',
			"<ProviderIcon",
			'\tname="p"',
			"\tsize={22}",
			"/>",
		].join("\n"),
	});
	const violations = checkUiTokens(root);
	assert.equal(violations.length, 2);
	assert.deepEqual(
		violations.map((v) => v.found),
		["size={15}", "size={22}"],
	);
	assert.deepEqual(
		violations.map((v) => v.line),
		[1, 4],
	);
});

test("合法 token 写法与 CSS 注释不误报", () => {
	const root = fixture({
		"web/src/probe.tsx": [
			'<div className="rounded-lg rounded-t-md text-sm text-2xs" />',
			"<Icon size={16} />",
			'<Icon className="x" size={32} />',
		].join("\n"),
		"web/src/probe.css": [
			"/* text-[13px] text-foreground/45 .ds-text */",
			".x { border-radius: 0; border-radius: var(--radius-sm); }",
		].join("\n"),
	});
	assert.deepEqual(checkRadiusTokens(root), []);
	assert.deepEqual(checkUiTokens(root), []);
});

test("调色板硬编码色命中门禁", () => {
	const root = fixture({
		"web/src/probe.tsx":
			'<div className="bg-black/50" />\n<div className="text-white" />\n',
	});
	assert.deepEqual(
		checkUiTokens(root).map((v) => v.found),
		["bg-black", "text-white"],
	);
});

test("字面颜色命中门禁，但 theme.css token 定义豁免", () => {
	const root = fixture({
		"web/src/probe.tsx": '<div className="bg-[#fff]" />\n',
		"packages/components/src/theme.css": ":root { --x: oklch(98% 0 0); }\n",
	});
	const violations = checkUiTokens(root);
	assert.equal(violations.length, 1);
	assert.equal(violations[0].found, "[#fff]");
});

test("非三档文字透明度与任意层级命中门禁", () => {
	const root = fixture({
		"web/src/probe.tsx":
			'<div className="text-primary-foreground/85 z-[100]" />\n',
	});
	assert.deepEqual(
		checkUiTokens(root).map((v) => v.found),
		["text-primary-foreground/85", "z-[100]"],
	);
});

test("ui-token-ignore 豁免下一行，ui-token-ignore-file 豁免整文件", () => {
	const root = fixture({
		"web/src/probe.tsx": [
			"// ui-token-ignore: 品牌色例外",
			'<div className="bg-white" />',
			'<div className="bg-black" />',
		].join("\n"),
		"web/src/skip.tsx": [
			"// ui-token-ignore-file: 品牌 Logo 固定色",
			'<div className="bg-white" />',
		].join("\n"),
	});
	assert.deepEqual(
		checkUiTokens(root).map((v) => `${v.file}:${v.line}:${v.found}`),
		["web/src/probe.tsx:3:bg-black"],
	);
});

test("合法语义 token 不误报", () => {
	const root = fixture({
		"web/src/probe.tsx":
			'<div className="bg-card text-foreground z-dialog accent-primary" />\n',
	});
	assert.deepEqual(checkUiTokens(root), []);
});

test("边框透明度档位、hover 描边面、禁用透明度回潮命中门禁", () => {
	const root = fixture({
		"web/src/probe.tsx": [
			'<div className="border-border/80" />',
			'<button className="hover:bg-border/50" />',
			'<button className="disabled:opacity-40" />',
		].join("\n"),
	});
	assert.deepEqual(
		checkUiTokens(root).map((v) => v.found),
		["border-border/80", "hover:bg-border/50", "disabled:opacity-40"],
	);
});

test("合法边框与 hover 面不误报", () => {
	const root = fixture({
		"web/src/probe.tsx":
			'<button className="border-border hover:bg-muted disabled:opacity-50" />\n',
	});
	assert.deepEqual(checkUiTokens(root), []);
});
