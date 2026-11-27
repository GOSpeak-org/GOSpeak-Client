import { getPlugin, pluginMethod } from "../bridge";

/**
 * 后台音频会话。
 *
 * 语音会话开始时 activate，把系统音频类别切到「录音 + 播放」（iOS
 * playAndRecord / Android MODE_IN_COMMUNICATION），否则锁屏或切后台后
 * 采集会被系统掐断。会话结束时 deactivate，把音频交还系统。
 */

interface AudioSessionPlugin {
	activate(): Promise<void>;
	deactivate(): Promise<void>;
}

export interface AudioSession {
	activate(): Promise<void>;
	deactivate(): Promise<void>;
	isActive(): boolean;
}

export function createAudioSession(): AudioSession {
	let active = false;

	const call = async (method: "activate" | "deactivate") => {
		if (!__GOSPEAK_MOBILE__) return;
		try {
			const plugin = await getPlugin<AudioSessionPlugin>("AudioSession");
			await plugin[method]();
		} catch (error) {
			console.warn(
				`[gospeak/mobile] ${pluginMethod("AudioSession", method)} failed`,
				error,
			);
		}
	};

	return {
		async activate() {
			await call("activate");
			active = true;
		},
		async deactivate() {
			await call("deactivate");
			active = false;
		},
		isActive() {
			return active;
		},
	};
}
