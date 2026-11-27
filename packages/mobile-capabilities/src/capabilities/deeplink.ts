import { getPlugin, listenPlugin } from "../bridge";

/**
 * 深链 gospeak://invite/d/<CODE>。
 *
 * 与桌面端 @gospeak/desktop 的 deeplink 能力语义一致：宿主把外部链接归一化成
 * 应用内相对路径，页面只处理以 "/" 开头的路径，避免任意 URL 把页面带走。
 */

const SCHEME_PREFIX = "gospeak://";

export function normalizeDeepLink(url: string): string | null {
	if (typeof url !== "string" || url.length === 0) return null;
	if (url.startsWith("/")) return url;
	if (!url.startsWith(SCHEME_PREFIX)) return null;
	const path = url.slice(SCHEME_PREFIX.length);
	return path.length > 0 ? `/${path.replace(/^\/+/, "")}` : null;
}

interface AppPlugin {
	getLaunchUrl(): Promise<{ url?: string } | null>;
}

export interface DeepLink {
	initial(): Promise<string | null>;
	onLink(handler: (path: string) => void): () => void;
}

export function createDeepLink(): DeepLink {
	const handlers = new Set<(path: string) => void>();
	let started = false;
	let initialUrl: string | null = null;

	const start = async () => {
		if (started || !__GOSPEAK_MOBILE__) return;
		started = true;
		try {
			await listenPlugin<{ url?: string }>("App", "appUrlOpen", (payload) => {
				const path = normalizeDeepLink(payload?.url ?? "");
				if (!path) return;
				for (const handler of handlers) handler(path);
			});
		} catch (error) {
			started = false;
			console.warn("[gospeak/mobile] deeplink listener failed", error);
		}
	};

	return {
		async initial() {
			if (!__GOSPEAK_MOBILE__) return null;
			if (initialUrl) return initialUrl;
			try {
				const plugin = await getPlugin<AppPlugin>("App");
				const result = await plugin.getLaunchUrl();
				initialUrl = normalizeDeepLink(result?.url ?? "");
				return initialUrl;
			} catch (error) {
				console.warn("[gospeak/mobile] getLaunchUrl failed", error);
				return null;
			}
		},
		onLink(handler) {
			handlers.add(handler);
			void start();
			return () => {
				handlers.delete(handler);
			};
		},
	};
}
