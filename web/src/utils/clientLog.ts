/**
 * 客户端日志抽象层。
 *
 * 同一套 API 在 Web 与桌面端都可用：
 *   - IndexedDB 环形缓冲（500 条 / 7 天）是两个平台共同的主存储；
 *   - 桌面端额外把每条日志复制到宿主内存环形缓冲（`ClientLog.Append`），
 *     因为崩溃时 WebView 已经死了，原生崩溃窗口只能读宿主那份；
 *   - 导出统一走 Blob 下载，两条平台分支只在「是否合并宿主日志」上不同。
 *
 * 采集入口有三个：`console.error/warn`、`window.onerror` / `unhandledrejection`，
 * 以及现有 `errorReport.ts` 的上报通道（React 边界）。
 */

import { registerErrorReporter } from "./errorReport";

export type ClientLogLevel = "error" | "warn" | "info";

export interface ClientLogEntry {
	id: string;
	/** 毫秒时间戳 */
	ts: number;
	level: ClientLogLevel;
	/** 来源：component / global / socket / host / ... */
	scope: string;
	message: string;
	stack?: string;
	extra?: Record<string, unknown>;
}

export interface ClientLogSink {
	append(entry: ClientLogEntry): void | Promise<void>;
	all(): Promise<ClientLogEntry[]>;
	clear(): Promise<void>;
}

const DB_NAME = "gospeak_logs";
const DB_VERSION = 1;
const STORE = "entries";
const MAX_ENTRIES = 500;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** console 与 errorReport 可能对同一个错误各上报一次，窗口内按内容去重。 */
const DEDUPE_WINDOW_MS = 1000;

function newId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === "undefined") {
			reject(new Error("indexedDB unavailable"));
			return;
		}
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) {
				const store = db.createObjectStore(STORE, { keyPath: "id" });
				store.createIndex("by_ts", "ts", { unique: false });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

/** IndexedDB 落盘实现：写入时顺带清理过期条目并裁剪到环形上限。 */
export const indexedDbSink: ClientLogSink = {
	async append(entry) {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, "readwrite");
			const store = tx.objectStore(STORE);
			store.put(entry);
			const countReq = store.count();
			countReq.onsuccess = () => {
				const overflow = countReq.result - MAX_ENTRIES;
				if (overflow <= 0) return;
				const cursorReq = store.index("by_ts").openCursor();
				let removed = 0;
				cursorReq.onsuccess = () => {
					const cursor = cursorReq.result;
					if (!cursor || removed >= overflow) return;
					cursor.delete();
					removed++;
					cursor.continue();
				};
			};
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	},

	async all() {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, "readonly");
			const req = tx.objectStore(STORE).index("by_ts").getAll();
			req.onsuccess = () => resolve(req.result as ClientLogEntry[]);
			req.onerror = () => reject(req.error);
		});
	},

	async clear() {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, "readwrite");
			tx.objectStore(STORE).clear();
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	},
};

// ---------------------------------------------------------------- 脱敏

const SECRET_QUERY =
	/([?&](?:token|access_token|refresh_token|code|password|secret|key)=)[^&#\s"']+/gi;
const BEARER = /\b(Bearer\s+)[A-Za-z0-9._~+/-]{8,}=*/gi;
const COOKIE_HEADER = /\b(cookie|set-cookie)\s*:\s*[^\n]*/gi;
const AUTH_HEADER = /\b(authorization)\s*:\s*[^\n]*/gi;

/** 抹掉 URL 查询参数、Bearer token 与 Cookie/Authorization 头。 */
export function redact(text: string): string {
	return text
		.replace(BEARER, "$1***")
		.replace(SECRET_QUERY, "$1***")
		.replace(COOKIE_HEADER, "$1: ***")
		.replace(AUTH_HEADER, "$1: ***");
}

// ---------------------------------------------------------------- 采集

const memory: ClientLogEntry[] = [];
let memoryLoaded = false;
let dedupeKey = "";
let dedupeAt = 0;
const sinks: ClientLogSink[] = [];

function trimMemory() {
	const cutoff = Date.now() - TTL_MS;
	while (
		memory.length > 0 &&
		(memory.length > MAX_ENTRIES || memory[0].ts < cutoff)
	) {
		memory.shift();
	}
}

/** 写入一条日志：内存 + 所有 sink。同一内容 1s 内只记一次。 */
export function log(
	level: ClientLogLevel,
	scope: string,
	message: string,
	extra?: { stack?: string; extra?: Record<string, unknown> },
): ClientLogEntry | null {
	const entry: ClientLogEntry = {
		id: newId(),
		ts: Date.now(),
		level,
		scope,
		message: redact(message),
		stack: extra?.stack ? redact(extra.stack) : undefined,
		extra: extra?.extra,
	};

	const key = `${level}\u0000${scope}\u0000${entry.message}\u0000${entry.stack ?? ""}`;
	if (key === dedupeKey && entry.ts - dedupeAt < DEDUPE_WINDOW_MS) return null;
	dedupeKey = key;
	dedupeAt = entry.ts;

	memory.push(entry);
	trimMemory();
	for (const sink of sinks) {
		// 同步与异步失败都必须就地吞掉：sink 失败若逃成 unhandledrejection，
		// 会被本模块的采集器再记一条，形成自我循环。
		try {
			const result = sink.append(entry);
			if (result && typeof (result as Promise<void>).catch === "function") {
				void (result as Promise<void>).catch(() => {});
			}
		} catch {
			// 单个 sink 失败不影响其它 sink 与内存
		}
	}
	return entry;
}

/** 注册额外 sink（桌面端用来把日志复制进宿主）。 */
export function addLogSink(sink: ClientLogSink): () => void {
	sinks.push(sink);
	return () => {
		const index = sinks.indexOf(sink);
		if (index >= 0) sinks.splice(index, 1);
	};
}

/** 当前内存中的日志（时间正序）。 */
export function currentEntries(): ClientLogEntry[] {
	return [...memory];
}

/** 清空内存与所有落盘存储。 */
export async function clearLogs(): Promise<void> {
	memory.length = 0;
	dedupeKey = "";
	try {
		await indexedDbSink.clear();
	} catch {
		// 存储不可用时只清内存
	}
	for (const sink of sinks) {
		try {
			await sink.clear();
		} catch {
			// 单个 sink 失败不影响其它
		}
	}
}

function fromConsole(level: ClientLogLevel, args: unknown[]) {
	const first = args[0];
	let message: string;
	let stack: string | undefined;
	if (first instanceof Error) {
		message = `${first.name}: ${first.message}`;
		stack = first.stack;
	} else if (typeof first === "string") {
		message = args
			.map((a) => (typeof a === "string" ? a : safeStringify(a)))
			.join(" ");
	} else {
		message = safeStringify(first);
	}
	if (!message) return;
	// errorReport 自己会用 `[GOSpeak:<scope>]` 前缀打一遍 console；那条已经
	// 由 reporter 通道按真实 scope 记过，跳过避免同一次错误记两条。
	if (message.startsWith("[GOSpeak:")) return;
	log(level, "console", message, { stack });
}

function safeStringify(value: unknown): string {
	try {
		return typeof value === "string" ? value : JSON.stringify(value);
	} catch {
		return String(value);
	}
}

let installed = false;

/**
 * 安装采集：console.error/warn、window.onerror、unhandledrejection，
 * 并把 errorReport 的上报通道接进同一个存储。
 *
 * 返回卸载函数（HMR 用）。
 */
export function installClientLog(): () => void {
	if (installed || typeof window === "undefined") return () => {};
	installed = true;

	// IndexedDB 是 Web 端的主存储，桌面端再叠加宿主 sink（main.tsx 注册）。
	// 两个平台都必须落盘，否则导出的报告里前端部分是空的。
	if (!sinks.includes(indexedDbSink)) sinks.push(indexedDbSink);

	void indexedDbSink
		.all()
		.then((stored) => {
			if (memoryLoaded) return;
			memoryLoaded = true;
			const cutoff = Date.now() - TTL_MS;
			const kept = stored.filter((e) => e.ts >= cutoff);
			memory.unshift(...kept);
			memory.sort((a, b) => a.ts - b.ts);
			trimMemory();
		})
		.catch(() => {
			memoryLoaded = true;
		});

	const originalError = console.error;
	const originalWarn = console.warn;

	console.error = (...args: unknown[]) => {
		fromConsole("error", args);
		originalError.apply(console, args);
	};
	console.warn = (...args: unknown[]) => {
		fromConsole("warn", args);
		originalWarn.apply(console, args);
	};

	const onError = (event: ErrorEvent) => {
		log("error", "window.error", event.message || "window error", {
			stack: event.error instanceof Error ? event.error.stack : undefined,
			extra: {
				filename: event.filename,
				lineno: event.lineno,
				colno: event.colno,
			},
		});
	};
	const onRejection = (event: PromiseRejectionEvent) => {
		const reason = event.reason;
		log(
			"error",
			"window.unhandledrejection",
			reason instanceof Error
				? `${reason.name}: ${reason.message}`
				: safeStringify(reason),
			{ stack: reason instanceof Error ? reason.stack : undefined },
		);
	};

	window.addEventListener("error", onError);
	window.addEventListener("unhandledrejection", onRejection);

	const unregisterReporter = registerErrorReporter((payload) => {
		// "global" 作用域来自 installGlobalErrorHandlers 的 window 监听，
		// 上面两个监听器已经记过同一次错误（且带 filename/行号）。重复记账会让
		// 错误风暴判定按 2 倍计数，误触发崩溃窗口，所以这里跳过。
		if (payload.scope === "global") return;
		log(
			"error",
			payload.scope,
			`${payload.error.name}: ${payload.error.message}`,
			{
				stack: [payload.error.stack, payload.componentStack]
					.filter(Boolean)
					.join("\n"),
				extra: payload.source ? { source: payload.source } : undefined,
			},
		);
	});

	return () => {
		installed = false;
		console.error = originalError;
		console.warn = originalWarn;
		window.removeEventListener("error", onError);
		window.removeEventListener("unhandledrejection", onRejection);
		unregisterReporter();
	};
}

// ---------------------------------------------------------------- 导出

function pad(n: number, width = 2): string {
	return String(n).padStart(width, "0");
}

/** 本地时区的 `YYYY-MM-DD HH:mm:ss.SSS`。 */
export function formatTs(ts: number): string {
	const d = new Date(ts);
	return (
		`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
		`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.` +
		`${pad(d.getMilliseconds(), 3)}`
	);
}

/** 导出文件名：`gospeak-log-20261115-220301.txt`。 */
export function exportFileName(now = Date.now()): string {
	const d = new Date(now);
	return (
		`gospeak-log-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
		`${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.txt`
	);
}

export interface LogContext {
	version: string;
	runtime: string;
	platform: string;
	server: string;
}

function entryBlock(entry: ClientLogEntry): string {
	const lines = [
		`[${formatTs(entry.ts)}] ${entry.level.toUpperCase()} ${entry.scope}`,
		`  ${entry.message}`,
	];
	if (entry.stack) {
		for (const line of entry.stack.split("\n")) lines.push(`  ${line}`);
	}
	if (entry.extra && Object.keys(entry.extra).length > 0) {
		lines.push(`  extra: ${safeStringify(entry.extra)}`);
	}
	return lines.join("\n");
}

/** 把前端与宿主日志合成一份纯文本报告。 */
export function buildLogText(
	clientEntries: ClientLogEntry[],
	hostEntries: ClientLogEntry[],
	context: LogContext,
	now = Date.now(),
): string {
	const merged = [...clientEntries, ...hostEntries].sort((a, b) => a.ts - b.ts);
	const range =
		merged.length > 0
			? `${formatTs(merged[0].ts)} .. ${formatTs(merged[merged.length - 1].ts)}`
			: "无";

	const head = [
		"GOSpeak 客户端日志",
		`生成时间: ${formatTs(now)}`,
		`版本: ${context.version}`,
		`运行环境: ${context.runtime}`,
		`平台: ${context.platform}`,
		`服务器: ${context.server || "(未配置)"}`,
		`前端日志: ${clientEntries.length} 条`,
		`宿主日志: ${hostEntries.length} 条`,
		`时间范围: ${range}`,
		"",
	];

	const clientSection = [
		"===== 前端日志 =====",
		...(clientEntries.length > 0 ? clientEntries.map(entryBlock) : ["(无)"]),
		"",
	];
	const hostSection = [
		"===== 宿主日志 =====",
		...(hostEntries.length > 0 ? hostEntries.map(entryBlock) : ["(无)"]),
		"",
	];

	return [...head, ...clientSection, ...hostSection].join("\n");
}

/** 触发浏览器/WebView 的下载。桌面宿主会接管并存进下载目录。 */
export function downloadText(text: string, fileName: string): void {
	const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = fileName;
	anchor.style.display = "none";
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	// Safari/WebKit 需要等下载真正开始再释放
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
