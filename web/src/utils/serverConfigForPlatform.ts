import { createServerConfig } from "@gospeak/desktop";
import type { ServerConfig } from "@gospeak/desktop";
import {
	createServerConfig as createMobileServerConfig,
	inMobile,
} from "@gospeak/mobile-capabilities";

/**
 * 当前平台权威的服务器地址存储。
 *
 * 移动端的权威值在原生 SharedPreferences / UserDefaults 里，必须走
 * mobile-capabilities 的插件；桌面 / 浏览器走 desktop 实现。
 * 统一从这里取，避免各处只写了一半平台分支导致移动端永远读到冷镜像。
 */
export function serverConfigForPlatform(): ServerConfig {
	return inMobile() ? createMobileServerConfig() : createServerConfig();
}
