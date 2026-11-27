import { bridge, command } from "../bridge";
import { isDesktop } from "../runtime";

/**
 * One log entry, mirrored in the host's in-memory ring so it survives a
 * WebView crash. Keep the JSON tags in sync with `ClientLogEntry` in
 * `app/desktop/clientlog.go`.
 */
export interface HostLogEntry {
	id: string;
	ts: number;
	level: "error" | "warn" | "info";
	scope: string;
	message: string;
	stack?: string;
	extra?: Record<string, unknown>;
}

/**
 * 客户端日志的桌面端能力。
 *
 * 页面侧的日志主存储是 IndexedDB（见 `app/web/src/utils/clientLog.ts`）；
 * 这里只负责宿主那一份副本：崩溃时 WebView 已经死了，原生崩溃窗口读不到
 * 页面存储，只能读宿主内存里的环形缓冲。
 */
export interface ClientLog {
	/** 追加一条到宿主环形缓冲（页面 sink 调用）。 */
	append(entry: HostLogEntry): Promise<void>;
	/** 宿主缓冲快照，时间正序。 */
	snapshot(): Promise<HostLogEntry[]>;
	/** 清空宿主缓冲。 */
	clear(): Promise<void>;
	/** 宿主日志文件所在目录。 */
	logsPath(): Promise<string>;
	/** 在文件管理器中揭示日志目录。 */
	revealLogs(): Promise<void>;
	/**
	 * 判定为不可逆崩溃时调用：宿主立即打开原生崩溃窗口
	 * （不再依赖页面，页面此刻通常已经不可用）。
	 */
	reportFatal(reason: string, detail?: string): Promise<void>;
}

const webFallback: ClientLog = {
	async append() {},
	async snapshot() {
		return [];
	},
	async clear() {},
	async logsPath() {
		return "";
	},
	async revealLogs() {},
	async reportFatal() {},
};

const native: ClientLog = {
	append: (entry) => bridge.invoke(command("ClientLog", "Append"), entry),
	snapshot: () =>
		bridge.invoke<HostLogEntry[]>(command("ClientLog", "Snapshot")),
	clear: () => bridge.invoke(command("ClientLog", "Clear")),
	logsPath: () => bridge.invoke<string>(command("ClientLog", "LogsPath")),
	revealLogs: () => bridge.invoke(command("ClientLog", "RevealLogs")),
	reportFatal: (reason, detail) =>
		bridge.invoke(command("ClientLog", "ReportFatal"), reason, detail ?? ""),
};

/** Returns the native host log inside the desktop host, an inert fallback otherwise. */
export function createClientLog(): ClientLog {
	return isDesktop() ? native : webFallback;
}
