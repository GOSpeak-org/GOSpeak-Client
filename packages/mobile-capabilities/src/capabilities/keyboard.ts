import { getPlugin, listenPlugin } from "../bridge";

/**
 * 软键盘事件与收起控制。
 *
 * iOS 的键盘内缩由 @capacitor/keyboard 在原生侧完成（capacitor.config.ts 里
 * resize: native）。这里只做两件事：把显示/隐藏事件抛给业务层，以及在需要时
 * 主动收起键盘（例如离开房间或关闭弹窗）。
 */

interface KeyboardPlugin {
	hide(): Promise<void>;
}

export interface KeyboardInfo {
	keyboardHeight: number;
}

export interface Keyboard {
	onShow(handler: (info: KeyboardInfo) => void): () => void;
	onHide(handler: () => void): () => void;
	hide(): Promise<void>;
}

export function createKeyboard(): Keyboard {
	const showHandlers = new Set<(info: KeyboardInfo) => void>();
	const hideHandlers = new Set<() => void>();
	let started = false;

	const start = async () => {
		if (started || !__GOSPEAK_MOBILE__) return;
		started = true;
		try {
			await listenPlugin<KeyboardInfo>(
				"Keyboard",
				"keyboardWillShow",
				(info) => {
					for (const handler of showHandlers) handler(info);
				},
			);
			await listenPlugin("Keyboard", "keyboardWillHide", () => {
				for (const handler of hideHandlers) handler();
			});
		} catch (error) {
			started = false;
			console.warn("[gospeak/mobile] Keyboard listener failed", error);
		}
	};

	return {
		onShow(handler) {
			showHandlers.add(handler);
			void start();
			return () => {
				showHandlers.delete(handler);
			};
		},
		onHide(handler) {
			hideHandlers.add(handler);
			void start();
			return () => {
				hideHandlers.delete(handler);
			};
		},
		async hide() {
			if (!__GOSPEAK_MOBILE__) return;
			try {
				const plugin = await getPlugin<KeyboardPlugin>("Keyboard");
				await plugin.hide();
			} catch (error) {
				console.warn("[gospeak/mobile] Keyboard.hide failed", error);
			}
		},
	};
}
