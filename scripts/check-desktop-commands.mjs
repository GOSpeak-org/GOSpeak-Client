#!/usr/bin/env node
// 校验桌面桥接契约：MyGo 以 "<Struct>.<Method>" 注册绑定方法（见
// `mygo generate` 的产物 app/desktop/mygo.ts），TS SDK 必须逐字使用同一串。
// 命令名写错时 MyGo 返回 "method X is not bound" 的 rejected Promise，而
// 大部分能力方法会静默吞掉错误，因此在 CI 阶段拦截。
//
// 同样校验跨进程事件名：Go 宿主用 mygo.NewEvent 发射、TS SDK 用 bridge.listen
// 监听，字面量分别集中在 app/desktop/events.go 与 packages/desktop/src/events.ts。
// 任一侧拼错都会让事件在运行期静默失效，所以这里做双向比对。
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

const DESKTOP_DIR = "desktop";
const TS_DIR = "packages/desktop/src/capabilities";
const TS_EVENTS_FILE = "packages/desktop/src/events.ts";

/** 从 Go 源码里取出 `mygo.Bind(X{})` 绑定的类型名。 */
export function extractBoundTypes(source) {
	const types = new Set();
	for (const m of source.matchAll(
		/mygo\.Bind\(\s*&?([A-Z]\w*)\s*\{\s*\}\s*\)/g,
	)) {
		types.add(m[1]);
	}
	return types;
}

/** 从一组 Go 源文件里取出 `<Type>.<Method>` 形式的绑定方法全集。 */
export function extractGoBindings(files) {
	const bound = new Set();
	for (const file of files) {
		for (const t of extractBoundTypes(file.source)) bound.add(t);
	}
	const methods = new Set();
	for (const file of files) {
		for (const m of file.source.matchAll(
			/^func\s+\(([A-Z]\w*)\)\s+([A-Z]\w*)\s*\(/gm,
		)) {
			const [, recv, method] = m;
			if (!bound.has(recv)) continue;
			methods.add(`${recv}.${method}`);
		}
	}
	return methods;
}

/** 从 TS SDK 里取出 `command("X", "Y")` 的命令名全集。 */
export function extractTsCommands(files) {
	const commands = new Set();
	for (const file of files) {
		for (const m of file.source.matchAll(
			/command\(\s*"([A-Z]\w*)"\s*,\s*"([A-Z]\w*)"\s*\)/g,
		)) {
			commands.add(`${m[1]}.${m[2]}`);
		}
	}
	return commands;
}

/**
 * 从宿主注入页面的 preload 脚本里取出 `runtime.call("X.Y", ...)` 的命令名，
 * 这些调用不经过 TS SDK，但同样必须与 Go 绑定一致。
 */
export function extractScriptCommands(files) {
	const commands = new Set();
	for (const file of files) {
		for (const m of file.source.matchAll(
			/\.call\(\s*"([A-Z]\w*\.[A-Z]\w*)"/g,
		)) {
			commands.add(m[1]);
		}
	}
	return commands;
}

/** 双向比对，返回两侧的差集。只有 missing 会让校验失败。 */
export function checkCommands({ bindings, commands }) {
	const missing = [...commands].filter((c) => !bindings.has(c)).sort();
	const unused = [...bindings].filter((b) => !commands.has(b)).sort();
	return { missing, unused, ok: missing.length === 0 };
}

/** 记录事件名及其首次出现的位置，供门禁报错时定位文件与行号。 */
function recordEvent(events, name, file, index) {
	if (events.has(name)) return;
	const line = file.source.slice(0, index).split("\n").length;
	events.set(name, { path: file.path, line });
}

/**
 * 从 Go 源码取事件名：events.go 里的集中常量 `eventXxx = "a.b"`，以及任何
 * 绕过常量的 `mygo.NewEvent[T]("a.b")` 字面量（手写兜底，同样要被门禁看到）。
 * 返回 Map<事件名, { path, line }>。
 */
export function extractGoEvents(files) {
	const events = new Map();
	const patterns = [
		/\bevent[A-Z]\w*\s*=\s*"([a-z][\w-]*\.[a-z][\w-]*)"/g,
		/mygo\.NewEvent\[[^\]]+\]\(\s*"([a-z][\w-]*\.[a-z][\w-]*)"/g,
	];
	for (const file of files) {
		for (const re of patterns) {
			for (const m of file.source.matchAll(re)) {
				recordEvent(events, m[1], file, m.index);
			}
		}
	}
	return events;
}

/**
 * 从 TS 源码取事件名：events.ts 里的集中常量字面量，以及任何绕过常量的
 * `bridge.listen("a.b")` 字面量。返回 Map<事件名, { path, line }>。
 */
export function extractTsEvents(files) {
	const events = new Map();
	const property = /\b\w+:\s*"([a-z][\w-]*\.[a-z][\w-]*)"/g;
	const listen = /bridge\.listen\(\s*"([a-z][\w-]*\.[a-z][\w-]*)"/g;
	for (const file of files) {
		// 常量对象的属性只在单一事实源模块里提取，避免把业务对象里的
		// `name: "a.wav"` 之类误当成事件名。
		if (basename(file.path) === "events.ts") {
			for (const m of file.source.matchAll(property)) {
				recordEvent(events, m[1], file, m.index);
			}
		}
		for (const m of file.source.matchAll(listen)) {
			recordEvent(events, m[1], file, m.index);
		}
	}
	return events;
}

/** 事件名双向比对：两侧集合差异都要报错（不同于命令名的 unused 只警告）。 */
export function checkEvents({ goEvents, tsEvents }) {
	const goOnly = [...goEvents.keys()].filter((e) => !tsEvents.has(e)).sort();
	const tsOnly = [...tsEvents.keys()].filter((e) => !goEvents.has(e)).sort();
	return { goOnly, tsOnly, ok: goOnly.length === 0 && tsOnly.length === 0 };
}

function goFiles(dir) {
	return readdirSync(dir)
		.filter((f) => f.endsWith(".go") && !f.endsWith("_test.go"))
		.map((f) => ({
			path: join(dir, f),
			source: readFileSync(join(dir, f), "utf8"),
		}));
}

function tsFiles(dir) {
	return readdirSync(dir)
		.filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
		.map((f) => ({
			path: join(dir, f),
			source: readFileSync(join(dir, f), "utf8"),
		}));
}

function preloadFiles(dir) {
	return readdirSync(dir)
		.filter((f) => f.startsWith("preload_") && f.endsWith(".js"))
		.map((f) => ({
			path: join(dir, f),
			source: readFileSync(join(dir, f), "utf8"),
		}));
}

export function checkRepo(root = ".") {
	const goSources = goFiles(join(root, DESKTOP_DIR));
	const capabilitySources = tsFiles(join(root, TS_DIR));
	const bindings = extractGoBindings(goSources);
	const commands = new Set([
		...extractTsCommands(capabilitySources),
		...extractScriptCommands(preloadFiles(join(root, DESKTOP_DIR))),
	]);
	const commandCheck = checkCommands({ bindings, commands });

	const tsEventSources = [...capabilitySources];
	const eventsPath = join(root, TS_EVENTS_FILE);
	if (existsSync(eventsPath)) {
		tsEventSources.unshift({
			path: eventsPath,
			source: readFileSync(eventsPath, "utf8"),
		});
	}
	const goEvents = extractGoEvents(goSources);
	const tsEvents = extractTsEvents(tsEventSources);
	const eventCheck = checkEvents({ goEvents, tsEvents });

	return {
		bindings,
		commands,
		...commandCheck,
		goEvents,
		tsEvents,
		...eventCheck,
	};
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const { missing, unused, goOnly, tsOnly, goEvents, tsEvents } =
		checkRepo(".");
	for (const b of unused) {
		// 只是提示：有些绑定方法由宿主自身调用（托盘、生命周期），SDK 不经过。
		console.warn(`::warning::宿主绑定了但 SDK 未调用: ${b}`);
	}
	for (const c of missing) {
		console.error(`::error::SDK 调用了宿主未绑定的方法: ${c}`);
	}
	const where = (at) => (at ? ` (${at.path}:${at.line})` : "");
	for (const e of goOnly) {
		console.error(
			`::error::Go 发射的事件 TS 未监听: ${e}${where(goEvents.get(e))}`,
		);
	}
	for (const e of tsOnly) {
		console.error(
			`::error::TS 监听的事件 Go 未发射: ${e}${where(tsEvents.get(e))}`,
		);
	}
	if (missing.length > 0 || goOnly.length > 0 || tsOnly.length > 0) {
		process.exit(1);
	}
	console.log("desktop bridge commands and events are in sync");
}
