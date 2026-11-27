import { getPlugin, listenPlugin } from "../bridge";

/**
 * Android 硬件返回键。
 *
 * Capacitor 一旦注册了 backButton 监听器就不再自行回退或退出，由这里决定行为：
 * 有浏览历史就回退，没有就退到后台。语音类应用在房间内误触返回不应该直接结束进程。
 */

interface AppPlugin {
	minimizeApp(): Promise<void>;
}

export interface BackButton {
	onBack(handler: () => void): () => void;
	minimize(): Promise<void>;
}

export function createBackButton(): BackButton {
	const handlers = new Set<() => void>();
	let started = false;

	const start = async () => {
		if (started || !__GOSPEAK_MOBILE__) return;
		started = true;
		try {
			await listenPlugin("App", "backButton", () => {
				for (const handler of handlers) handler();
			});
		} catch (error) {
			started = false;
			console.warn("[gospeak/mobile] App.backButton listener failed", error);
		}
	};

	return {
		onBack(handler) {
			handlers.add(handler);
			void start();
			return () => {
				handlers.delete(handler);
			};
		},
		async minimize() {
			if (!__GOSPEAK_MOBILE__) return;
			try {
				const plugin = await getPlugin<AppPlugin>("App");
				await plugin.minimizeApp();
			} catch (error) {
				console.warn("[gospeak/mobile] App.minimizeApp failed", error);
			}
		},
	};
}
