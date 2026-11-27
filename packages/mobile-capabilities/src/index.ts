/**
 * @gospeak/mobile-capabilities
 *
 * 移动端能力 SDK：@gospeak/web 与原生宿主（app/mobile，Capacitor）之间的桥接。
 * 每个能力都有原生实现与 Web 安全降级，同一份组件代码在浏览器与原生壳里都能跑。
 *
 * 业务代码判定平台用 inMobile()；需要整体裁剪的模块用 __GOSPEAK_MOBILE__。
 */

export {
	BUILD_TARGET,
	DESKTOP_BUILD,
	MOBILE_BUILD,
	WEB_BUILD,
	assertMobile,
	ifMobile,
	importMobile,
	inMobile,
	isCapacitor,
} from "./conditional";
export type { BuildTarget } from "./conditional";

export { getPlugin, listenPlugin, pluginMethod } from "./bridge";

export { createBackButton } from "./capabilities/back-button";
export type { BackButton } from "./capabilities/back-button";

export { createAudioSession } from "./capabilities/audio-session";
export type { AudioSession } from "./capabilities/audio-session";

export { createAudioRoute, isAudioRouteKind } from "./capabilities/audio-route";
export type {
	AudioRoute,
	AudioRouteKind,
	AudioRouteOption,
} from "./capabilities/audio-route";

export {
	createMediaControl,
	isMediaAction,
} from "./capabilities/media-control";
export type {
	MediaAction,
	MediaControl,
	MediaMetadata,
} from "./capabilities/media-control";

export { createPush, normalizePushData } from "./capabilities/push";
export type { Push } from "./capabilities/push";

export { createDeepLink, normalizeDeepLink } from "./capabilities/deeplink";
export type { DeepLink } from "./capabilities/deeplink";

export { createKeyboard } from "./capabilities/keyboard";
export type {
	Keyboard,
	KeyboardInfo,
} from "./capabilities/keyboard";

export { createLifecycle, isAppState } from "./capabilities/lifecycle";
export type { AppState, Lifecycle } from "./capabilities/lifecycle";

export { createLocalNotification } from "./capabilities/local-notification";
export { createServerConfig, SERVER_BASE_URL_KEY } from "./capabilities/server";
export type { ServerConfig } from "./capabilities/server";
export type {
	LocalNotification,
	LocalNotificationOptions,
} from "./capabilities/local-notification";

import { BUILD_TARGET } from "./conditional";
import { createBackButton } from "./capabilities/back-button";
import { createAudioSession } from "./capabilities/audio-session";
import { createAudioRoute } from "./capabilities/audio-route";
import { createMediaControl } from "./capabilities/media-control";
import { createPush } from "./capabilities/push";
import { createDeepLink } from "./capabilities/deeplink";
import { createKeyboard } from "./capabilities/keyboard";
import { createLifecycle } from "./capabilities/lifecycle";
import { createLocalNotification } from "./capabilities/local-notification";
import { createServerConfig } from "./capabilities/server";

export function createMobile() {
	return {
		runtime: BUILD_TARGET,
		backButton: createBackButton(),
		audioSession: createAudioSession(),
		audioRoute: createAudioRoute(),
		mediaControl: createMediaControl(),
		push: createPush(),
		deepLink: createDeepLink(),
		lifecycle: createLifecycle(),
		keyboard: createKeyboard(),
		localNotification: createLocalNotification(),
		serverConfig: createServerConfig(),
	};
}

export type Mobile = ReturnType<typeof createMobile>;
