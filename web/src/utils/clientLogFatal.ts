/**
 * 前端「不可逆崩溃」判定。
 *
 * 两个信号，任一成立即认为页面已经救不回来，交给宿主打开原生崩溃窗口：
 *   1. 白屏：挂载后 N 秒 `#app` 仍没有子元素；
 *   2. 错误风暴：滑动窗口内未捕获错误次数达到阈值（通常是无限重渲染 / 循环抛错）。
 *
 * 判定本身是纯函数，便于单测；副作用只在 installFatalWatcher 里。
 */

import { currentEntries, type ClientLogEntry } from "./clientLog";
import { reportFatalToHost } from "./clientLogDesktop";

export const STORM_WINDOW_MS = 60_000;
export const STORM_THRESHOLD = 5;
export const WHITE_SCREEN_DELAY_MS = 10_000;

/**
 * 错误风暴判定：`timestamps` 为未捕获错误的时间戳（毫秒，任意顺序）。
 * 返回 true 表示 `now` 时点的窗口内已达到阈值。
 */
export function isErrorStorm(
	timestamps: number[],
	now: number,
	windowMs = STORM_WINDOW_MS,
	threshold = STORM_THRESHOLD,
): boolean {
	let count = 0;
	for (const ts of timestamps) {
		if (now - ts <= windowMs) count++;
	}
	return count >= threshold;
}

/** 从日志条目里挑出未捕获错误的来源。 */
export function isUncaughtError(entry: ClientLogEntry): boolean {
	return (
		entry.level === "error" &&
		(entry.scope === "window.error" ||
			entry.scope === "window.unhandledrejection" ||
			entry.scope === "global")
	);
}

/** 从当前日志里取出未捕获错误的时间戳。 */
export function uncaughtErrorTimestamps(entries: ClientLogEntry[]): number[] {
	return entries.filter(isUncaughtError).map((e) => e.ts);
}

function isBlank(): boolean {
	const app = document.getElementById("app");
	return !app || app.childElementCount === 0;
}

let installed = false;

/**
 * 安装崩溃监视：轮询错误风暴，并在延迟后检查一次白屏。
 * 只在桌面端真正上报（浏览器里 reportFatalToHost 返回 false，无副作用）。
 */
export function installFatalWatcher(): () => void {
	if (installed || typeof window === "undefined") return () => {};
	installed = true;

	const fired = { storm: false, blank: false };

	const checkStorm = () => {
		if (fired.storm) return;
		if (isErrorStorm(uncaughtErrorTimestamps(currentEntries()), Date.now())) {
			fired.storm = true;
			reportFatalToHost(
				"前端连续抛出未捕获错误，界面已无法继续运行。",
				`最近 ${STORM_WINDOW_MS / 1000} 秒内达到 ${STORM_THRESHOLD} 次未捕获错误。`,
			);
		}
	};

	const timer = window.setInterval(checkStorm, 5_000);

	const blankTimer = window.setTimeout(() => {
		if (fired.blank) return;
		if (isBlank()) {
			fired.blank = true;
			reportFatalToHost(
				"前端未能渲染：应用挂载点为空。",
				`挂载后 ${WHITE_SCREEN_DELAY_MS / 1000} 秒内 #app 仍没有内容。`,
			);
		}
	}, WHITE_SCREEN_DELAY_MS);

	return () => {
		installed = false;
		window.clearInterval(timer);
		window.clearTimeout(blankTimer);
	};
}
