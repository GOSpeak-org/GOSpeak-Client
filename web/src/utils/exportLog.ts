/**
 * 导出日志：设置页（关于 tab / 桌面 tab）共用的唯一入口。
 *
 * 行为按平台不同，但导出物一致——一份纯文本、走 Blob 下载：
 *   - Web：浏览器原生下载；
 *   - 桌面：同一个 Blob，宿主 `Page.OnWillDownload` 接管，命名去重后落进
 *     下载目录并弹系统通知。
 *
 * 桌面端在导出前额外拉一次宿主环形缓冲，把崩溃前的宿主日志一起合进报告。
 */

import {
	createClientLog,
	createServerConfig,
	inDesktop,
} from "@gospeak/desktop";
import {
	buildLogText,
	downloadText,
	exportFileName,
	indexedDbSink,
	type ClientLogEntry,
	type LogContext,
} from "./clientLog";

function platformLabel(): string {
	if (typeof navigator === "undefined") return "unknown";
	return `${navigator.platform || "unknown"} / ${navigator.userAgent}`;
}

/** 汇总当前环境信息，写进报告头。 */
export async function collectLogContext(): Promise<LogContext> {
	let server = "";
	try {
		server = await createServerConfig().getBaseUrl();
	} catch {
		// 桌面宿主不可达时留空
	}
	return {
		version: __APP_VERSION__,
		runtime: inDesktop() ? "desktop" : "web",
		platform: platformLabel(),
		server,
	};
}

/** 读取宿主那份环形缓冲；非桌面端返回空数组。 */
export async function readHostEntries(): Promise<ClientLogEntry[]> {
	if (!inDesktop()) return [];
	try {
		const entries = await createClientLog().snapshot();
		return entries.map((e) => ({
			id: e.id,
			ts: e.ts,
			level: e.level,
			scope: e.scope,
			message: e.message,
			stack: e.stack,
			extra: e.extra,
		}));
	} catch {
		return [];
	}
}

/** 生成完整报告文本（不触发下载）。 */
export async function buildExportText(): Promise<string> {
	let clientEntries: ClientLogEntry[] = [];
	try {
		clientEntries = await indexedDbSink.all();
	} catch {
		// 存储不可用时只导宿主那份
	}
	const hostEntries = await readHostEntries();
	return buildLogText(clientEntries, hostEntries, await collectLogContext());
}

/**
 * 导出日志文件。返回文件名（桌面端宿主接管下载，这里只报告触发成功）。
 * 抛错时调用方负责展示。
 */
export async function exportLogFile(): Promise<string> {
	const text = await buildExportText();
	const name = exportFileName();
	downloadText(text, name);
	return name;
}
