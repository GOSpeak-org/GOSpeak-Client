import type { SFUProvider } from "@gospeak/sfu-client/types";
import type { JoinTokenResponse } from "@/api/sfu";
import type { VoiceProviderAdapter } from "./voiceSessionTypes";

function defaultJoinKey(token: JoinTokenResponse): string {
	return `${token.room}::${token.identity}::${token.stream || ""}`;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLoopback(host: string): boolean {
	return LOOPBACK_HOSTS.has(host.toLowerCase().replace(/^\[|\]$/g, ""));
}

/**
 * 原生壳（Android/iOS/桌面）把页面挂在回环反代上，反代已经转发 /livekit；
 * 后端在 LIVEKIT_PUBLIC_URL 或边缘反代影响下会下发公网绝对地址，直接从回环
 * 源去连就是跨域请求，会被 CORS 拦掉并陷入「连上→断连→重进」循环。
 * 仅在「页面来自回环 + 目标是远端 /livekit」时改走同源，Web 公网与已同源
 * 的地址保持原样。
 */
export function resolveLivekitConnectTarget(
	serverUrl: string,
	pageUrl: string,
): string {
	let target: URL;
	let page: URL;
	try {
		target = new URL(serverUrl);
		page = new URL(pageUrl);
	} catch {
		return serverUrl;
	}
	const path = target.pathname.replace(/\/+$/, "");
	if (path !== "/livekit" && !path.startsWith("/livekit/")) return serverUrl;
	if (!isLoopback(page.hostname) || isLoopback(target.hostname)) {
		return serverUrl;
	}
	const scheme = page.protocol === "https:" ? "wss:" : "ws:";
	return `${scheme}//${page.host}${target.pathname.replace(/\/+$/, "")}`;
}

function currentPageUrl(): string {
	return typeof window === "undefined" ? "" : window.location.href;
}

// LiveKit：完整 media + signal 后才 ready。不串行、不 background。
const livekitAdapter: VoiceProviderAdapter = {
	provider: "livekit",
	resolveConnectTarget: (token) =>
		resolveLivekitConnectTarget(token.serverUrl, currentPageUrl()),
	signalJoinMode: "await",
	serializeJoins: false,
	joinKey: defaultJoinKey,
};

const ADAPTERS: Record<SFUProvider, VoiceProviderAdapter> = {
	livekit: livekitAdapter,
};

export function getVoiceProviderAdapter(
	provider: SFUProvider,
): VoiceProviderAdapter {
	return ADAPTERS[provider] ?? livekitAdapter;
}

export function resolveConnectTarget(
	provider: SFUProvider,
	token: JoinTokenResponse,
): string {
	return getVoiceProviderAdapter(provider).resolveConnectTarget(token);
}
