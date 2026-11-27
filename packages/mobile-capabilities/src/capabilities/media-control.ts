import { getPlugin, listenPlugin } from "../bridge";

/**
 * 锁屏 / 通知栏媒体控制。
 *
 * Android WebView 不支持 Media Session Web API，必须走原生插件；iOS 侧同样由
 * 插件接管，保证两端行为一致。锁屏上的 静音 / 挂断 通过事件回传 web 层，
 * 由语音会话模块执行真正的动作。
 */

export type MediaAction = "mute" | "unmute" | "hangup";

const MEDIA_ACTIONS: readonly MediaAction[] = ["mute", "unmute", "hangup"];

export interface MediaMetadata {
	title: string;
	subtitle?: string;
	/** 当前是否静音，用于切换锁屏按钮文案。 */
	muted?: boolean;
}

interface MediaControlPlugin {
	setMetadata(options: MediaMetadata): Promise<void>;
	clear(): Promise<void>;
}

export interface MediaControl {
	setMetadata(input: MediaMetadata): Promise<void>;
	clear(): Promise<void>;
	onAction(handler: (action: MediaAction) => void): () => void;
}

export function isMediaAction(value: unknown): value is MediaAction {
	return (
		typeof value === "string" &&
		(MEDIA_ACTIONS as readonly string[]).includes(value)
	);
}

export function createMediaControl(): MediaControl {
	const handlers = new Set<(action: MediaAction) => void>();
	let listening = false;

	const ensureListener = async () => {
		if (listening || !__GOSPEAK_MOBILE__) return;
		listening = true;
		try {
			await listenPlugin<{ action?: string }>(
				"MediaControl",
				"action",
				(payload) => {
					if (!isMediaAction(payload?.action)) return;
					for (const handler of handlers) handler(payload.action);
				},
			);
		} catch (error) {
			listening = false;
			console.warn(
				"[gospeak/mobile] MediaControl.action listener failed",
				error,
			);
		}
	};

	return {
		async setMetadata(input) {
			if (!__GOSPEAK_MOBILE__) return;
			try {
				const plugin = await getPlugin<MediaControlPlugin>("MediaControl");
				await plugin.setMetadata(input);
			} catch (error) {
				console.warn("[gospeak/mobile] MediaControl.setMetadata failed", error);
			}
		},
		async clear() {
			if (!__GOSPEAK_MOBILE__) return;
			try {
				const plugin = await getPlugin<MediaControlPlugin>("MediaControl");
				await plugin.clear();
			} catch (error) {
				console.warn("[gospeak/mobile] MediaControl.clear failed", error);
			}
		},
		onAction(handler) {
			handlers.add(handler);
			void ensureListener();
			return () => {
				handlers.delete(handler);
			};
		},
	};
}
