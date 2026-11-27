import { listenPlugin } from "../bridge";

/**
 * 应用前后台切换。
 *
 * 语音场景的关键钩子：回到前台时上层要做 socket 重连与媒体健康检查，
 * 切后台时要保证音频会话仍然活跃（否则锁屏会静音）。
 */

export type AppState = "active" | "background";

const APP_STATES: readonly AppState[] = ["active", "background"];

export function isAppState(value: unknown): value is AppState {
	return (
		typeof value === "string" &&
		(APP_STATES as readonly string[]).includes(value)
	);
}

export interface Lifecycle {
	onStateChange(handler: (state: AppState) => void): () => void;
}

export function createLifecycle(): Lifecycle {
	const handlers = new Set<(state: AppState) => void>();
	let started = false;

	const start = async () => {
		if (started || !__GOSPEAK_MOBILE__) return;
		started = true;
		try {
			await listenPlugin<{ isActive?: boolean }>(
				"App",
				"appStateChange",
				(payload) => {
					const state: AppState = payload?.isActive ? "active" : "background";
					for (const handler of handlers) handler(state);
				},
			);
		} catch (error) {
			started = false;
			console.warn("[gospeak/mobile] appStateChange listener failed", error);
		}
	};

	return {
		onStateChange(handler) {
			handlers.add(handler);
			void start();
			return () => {
				handlers.delete(handler);
			};
		},
	};
}
