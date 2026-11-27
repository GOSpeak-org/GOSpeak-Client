import { readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { checkRadiusTokens } from "./check-radius-tokens.mjs";

// UI token 护栏。规范唯一来源是 packages/components/src/theme.css
// （见其文件头的暗色派生规则与文字三档），这里防止它被新代码绕开。
//
// 拦住 9 类回退：
//   1. 任意圆角        rounded-[6px]                 → 用 rounded-sm/md/lg/xl/2xl
//   2. ds-* 语义双轨   ds-text / ds-panel / ds-border → 用 text-foreground / bg-card / border-border
//   3. 任意字号        text-[13px/20px]               → 用 text-2xs/xs/sm/base/lg/xl
//   4. 文字透明度档位  text-foreground/45             → 用 text-foreground / -muted-foreground / -faint-foreground
//   5. 裸圆角与越界图标 rounded / size={15}           → 用 rounded-sm / size={12|14|16|20|24|32}
//   6. 调色板硬编码色  text-white / bg-black/50       → 用语义 token 或新增并补齐全部主题
//   7. 字面颜色        bg-[#fff] / rgba() / oklch()   → 用 color-mix(in oklab, var(--token) …)
//   8. 任意层级        z-[100]                        → 用 z-dialog / z-popover / z-toast
//   9. 品牌色例外需注释 ui-token-ignore-file（文件）/ ui-token-ignore（下一行）
const SCAN_DIRS = ["web/src", "packages/components/src"];
const SKIP_DIRS = new Set(["node_modules", "dist", "_solid-legacy"]);
const SCRIPT_EXTS = /\.(tsx?|jsx?)$/;
const STYLE_EXTS = /\.css$/;
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const TOKEN_SOURCE = "theme.css";
const IGNORE_FILE = /ui-token-ignore-file/;
const IGNORE_LINE = /ui-token-ignore(?:\s*:|\s*$)/;

const DS_DUPLICATE =
	/\bds-(?:text|body|muted|faint|border|bg|panel|userbar|subtle|hover|active|deep|blurple|divider|input-bg|msg-row|danger)\b/;
const ARBITRARY_FONT_SIZE =
	/\btext-\[\d+(?:\.\d+)?(?:px|rem)(?:\/\d+(?:\.\d+)?(?:px|rem|%)?)?\]/;
const FOREGROUND_OPACITY = /\btext-[a-z0-9-]*foreground\/\d+/;
const PALETTE_COLOR =
	/\b(?:text|bg|border|ring|fill|stroke|divide|from|to|via)-(?:white|black|(?:slate|gray|zinc|neutral|red|orange|amber|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/;
const LITERAL_COLOR =
	/\[#[\da-fA-F]{3,8}\]|fill="#[\da-fA-F]{3,8}"|stroke="#[\da-fA-F]{3,8}"|\b(?:rgba?|hsla?|oklch)\(/;
const Z_ARBITRARY = /\bz-\[\d+\]/;
const BORDER_OPACITY = /\bborder-(?:border|input)\/(?:60|70|80)\b/;
const HOVER_BORDER_SURFACE = /\bhover:bg-border(?:\/\d+)?\b/;
const DISABLED_OPACITY_40 = /\bdisabled:opacity-40\b/;
const BARE_ROUNDED = /(?<![\w-])rounded(?![\w-])/;
const ICON_SIZE = /<[A-Z][A-Za-z0-9]*(?:\s+[^>]*?)?\s+size=\{(\d+)\}/g;
const ICON_SIZES = new Set([12, 14, 16, 20, 24, 32]);

const RULES = [
	{
		pattern: DS_DUPLICATE,
		hint: "ds-* 语义层已并入 theme.css token，直接用 Tailwind token",
	},
	{
		pattern: ARBITRARY_FONT_SIZE,
		hint: "字号只允许 text-2xs/xs/sm/base/lg/xl",
	},
	{
		pattern: FOREGROUND_OPACITY,
		hint: "文字层级只有 text-foreground / -muted-foreground / -faint-foreground",
	},
	{
		pattern: BARE_ROUNDED,
		hint: "圆角必须显式写档位（rounded-sm/lg/xl/2xl/full）",
	},
	{
		pattern: PALETTE_COLOR,
		hint: "颜色必须走 theme.css 语义 token，禁止调色板硬编码",
	},
	{
		pattern: LITERAL_COLOR,
		hint: "禁止字面颜色，改成 color-mix(in oklab, var(--token) …)",
		tokenSourceExempt: true,
	},
	{
		pattern: Z_ARBITRARY,
		hint: "层级必须用 z-base/raised/dropdown/dialog/popover/toast 语义 token",
	},
	{
		pattern: BORDER_OPACITY,
		hint: "结构边框用 border-border 原值（暗色下 /60 /70 /80 会让边框消失），tokenSourceExempt",
		tokenSourceExempt: true,
	},
	{
		pattern: HOVER_BORDER_SURFACE,
		hint: "hover 面用 hover:bg-muted，border 是描边 token 不能当表面",
	},
	{
		pattern: DISABLED_OPACITY_40,
		hint: "禁用态统一 disabled:opacity-50",
	},
];

function walk(dir, files = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name)) {
				walk(join(dir, entry.name), files);
			}
			continue;
		}
		if (SCRIPT_EXTS.test(entry.name) || STYLE_EXTS.test(entry.name)) {
			files.push(join(dir, entry.name));
		}
	}
	return files;
}

export function checkUiTokens(rootDir) {
	const violations = [];

	for (const dir of SCAN_DIRS) {
		let files;
		try {
			files = walk(join(rootDir, dir));
		} catch {
			continue;
		}

		for (const file of files) {
			const isStyle = STYLE_EXTS.test(file);
			const raw = readFileSync(file, "utf8");
			const rawLines = raw.split("\n");
			if (rawLines.slice(0, 5).some((line) => IGNORE_FILE.test(line))) continue;

			const ignoredLines = new Set();
			rawLines.forEach((line, index) => {
				if (IGNORE_LINE.test(line)) ignoredLines.add(index + 2);
			});

			const source = isStyle
				? raw.replace(CSS_COMMENT, (comment) => comment.replace(/[^\n]/g, " "))
				: raw;
			const isTokenSource = basename(file) === TOKEN_SOURCE;
			const lines = source.split("\n");

			lines.forEach((line, index) => {
				if (ignoredLines.has(index + 1)) return;
				for (const rule of RULES) {
					if (rule.tokenSourceExempt && isTokenSource) continue;
					const match = rule.pattern.exec(line);
					if (match) {
						violations.push({
							file: relative(rootDir, file),
							line: index + 1,
							found: match[0],
							hint: rule.hint,
						});
					}
				}
			});

			if (isStyle) continue;

			ICON_SIZE.lastIndex = 0;
			for (const match of source.matchAll(ICON_SIZE)) {
				const size = Number(match[1]);
				if (ICON_SIZES.has(size)) continue;
				const sizeIndex = match[0].lastIndexOf(`size={${size}}`);
				const line = source
					.slice(0, match.index + sizeIndex)
					.split("\n").length;
				if (ignoredLines.has(line)) continue;
				violations.push({
					file: relative(rootDir, file),
					line,
					found: `size={${size}}`,
					hint: `图标尺寸只有 ${[...ICON_SIZES].join(" / ")} 六档`,
				});
			}
		}
	}

	return violations;
}

function main() {
	const rootDir = process.argv[2] ?? process.cwd();
	const violations = [
		...checkRadiusTokens(rootDir).map((v) => ({
			...v,
			hint: "圆角必须走 theme.css 的 token 档位",
		})),
		...checkUiTokens(rootDir),
	];

	if (violations.length > 0) {
		for (const violation of violations) {
			console.error(
				`::error file=${violation.file},line=${violation.line}::${violation.found} — ${violation.hint}`,
			);
		}
		console.error(`ui token check failed: ${violations.length} violation(s)`);
		process.exitCode = 1;
		return;
	}

	console.log("ui token check ok");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}
