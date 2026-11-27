import { getPlugin } from "../bridge";

/** 与桌面端共用的 localStorage 镜像键。 */
export const SERVER_BASE_URL_KEY = "gospeak.server.baseUrl";

interface ServerConfigPlugin {
	getBaseURL(): Promise<{ baseUrl?: string }>;
	setBaseURL(options: { url: string }): Promise<void>;
}

export interface ServerConfig {
	getBaseUrl(): Promise<string>;
	getBaseUrlSync(): string;
	setBaseUrl(url: string): Promise<void>;
}

/**
 * 服务器地址的规范形式：去掉首尾空白与末尾斜杠。`https://x/` 与 `https://x`
 * 是同一台服务器，只有后者能进入存储、参与比较或回显。
 * 与桌面端、原生宿主共用的规则一致（app/shared/proxyrules.NormalizeBaseURL）。
 */
function normalizeBaseUrl(url: string): string {
	return url.trim().replace(/\/+$/, "");
}

function readMirror(): string {
	try {
		if (typeof localStorage === "undefined") return "";
		return (localStorage.getItem(SERVER_BASE_URL_KEY) ?? "").trim();
	} catch {
		return "";
	}
}

function writeMirror(url: string): void {
	try {
		if (typeof localStorage === "undefined") return;
		const next = normalizeBaseUrl(url);
		if (next === "") localStorage.removeItem(SERVER_BASE_URL_KEY);
		else localStorage.setItem(SERVER_BASE_URL_KEY, next);
	} catch {
		// 隐私模式：镜像只是缓存，失败不影响原生存储。
	}
}

function assertBaseUrl(url: string): void {
	if (url === "") return;
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`无效的服务器地址（需要完整 URL）：${url}`);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(`服务器地址只支持 http/https：${parsed.protocol}`);
	}
}

/**
 * 服务器地址：原生侧存 SharedPreferences / UserDefaults 并驱动本地反代；
 * 浏览器降级只用 localStorage。与 @gospeak/desktop 的 createServerConfig 同接口。
 */
export function createServerConfig(): ServerConfig {
	return {
		async getBaseUrl() {
			if (!__GOSPEAK_MOBILE__) return normalizeBaseUrl(readMirror());
			try {
				const plugin = await getPlugin<ServerConfigPlugin>("ServerConfig");
				const result = await plugin.getBaseURL();
				const next = normalizeBaseUrl(
					typeof result?.baseUrl === "string" ? result.baseUrl : "",
				);
				if (next !== readMirror()) writeMirror(next);
				return next;
			} catch (error) {
				console.warn("[gospeak/mobile] ServerConfig.getBaseURL failed", error);
				return normalizeBaseUrl(readMirror());
			}
		},
		getBaseUrlSync: () => normalizeBaseUrl(readMirror()),
		async setBaseUrl(url) {
			const next = normalizeBaseUrl(url);
			assertBaseUrl(next);
			// 先写镜像：原生插件切换目标后会 reload WebView，之后的代码可能不执行。
			writeMirror(next);
			if (!__GOSPEAK_MOBILE__) return;
			try {
				const plugin = await getPlugin<ServerConfigPlugin>("ServerConfig");
				await plugin.setBaseURL({ url: next });
			} catch (error) {
				console.warn("[gospeak/mobile] ServerConfig.setBaseURL failed", error);
				throw error;
			}
		},
	};
}
