/**
 * 桌面端日志接入：把 clientLog 的条目复制进宿主环形缓冲。
 *
 * 页面自己的 IndexedDB 在 WebView 崩溃后读不到，原生崩溃窗口只能读宿主那份，
 * 所以桌面端每条日志都额外过一次桥。桥调用走 preload 注入的队列
 * （`window.__gospeakHostLog`），宿主还没就绪时先排队，就绪后自动补发。
 */

import { addLogSink, type ClientLogEntry } from "./clientLog";

interface HostLogQueue {
	enqueue(entry: ClientLogEntry): void;
}

interface DesktopLogGlobals {
	__gospeakHostLog?: HostLogQueue;
	__gospeakReportFatal?: (reason: string, detail?: string) => void;
}

function globals(): DesktopLogGlobals {
	return window as unknown as DesktopLogGlobals;
}

/** 宿主环形缓冲是否可用（preload 已注入）。 */
export function hasHostLog(): boolean {
	return typeof globals().__gospeakHostLog?.enqueue === "function";
}

/** 注册桌面 sink；宿主不可用时是空操作。 */
export function installDesktopLogSink(): () => void {
	if (!hasHostLog()) return () => {};
	return addLogSink({
		append(entry) {
			globals().__gospeakHostLog?.enqueue(entry);
		},
		// 宿主的读取与清空走 @gospeak/desktop 的 createClientLog()，
		// 这里只是写入通道，避免把宿主快照混进页面存储的语义里。
		async all() {
			return [];
		},
		async clear() {
			return;
		},
	});
}

/** 通知宿主打开原生崩溃窗口（页面已不可用时用）。 */
export function reportFatalToHost(reason: string, detail?: string): boolean {
	const fn = globals().__gospeakReportFatal;
	if (typeof fn !== "function") return false;
	fn(reason, detail);
	return true;
}
