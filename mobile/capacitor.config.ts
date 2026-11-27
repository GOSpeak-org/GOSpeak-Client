import type { CapacitorConfig } from "@capacitor/cli";

/**
 * 移动端宿主配置。
 *
 * - webDir 指向 app/web 的 mobile 目标产物（见 app/web/vite.config.ts 的 outDir）。
 * - dev：设 GOSPEAK_MOBILE_DEV_URL 后窗口直接加载局域网 Vite（真机热重载），
 *   与桌面端 GOSPEAK_DESKTOP_DEV 的思路一致。
 * - release：加载内嵌 bundle。
 */
const devUrl = process.env.GOSPEAK_MOBILE_DEV_URL;

const config: CapacitorConfig = {
	appId: "dev.gospeak.mobile",
	appName: "GOSpeak",
	webDir: "../web/dist-mobile",
	// release 不写死端口：原生反代在 47900-47919 内挑一个可用端口并持久化，
	// WebView 地址由原生层在启动时注入；dev 仍可直接加载局域网 Vite。
	server: {
		url: devUrl,
		cleartext: true,
	},
	ios: {
		scheme: "gospeak",
		// 安全区内缩交给前端 CSS 的 env(safe-area-inset-*) 统一处理（app/web/src/assets/styles/global.css），
		// 这里必须关掉原生自动内缩，否则刘海屏会被内缩两次。
		contentInset: "never",
	},
	android: {
		allowMixedContent: false,
	},
	plugins: {
		// iOS 键盘内缩由插件负责：resize 默认 native，未安装本插件时 WKWebView
		// 完全不缩放，键盘会直接盖住底部输入框。autoBackdropColor 让键盘背后
		// 的留白跟随应用主题，避免深色主题下闪一片白。
		Keyboard: {
			resize: "native",
			autoBackdropColor: "auto",
		},
		PushNotifications: {
			presentationOptions: ["badge", "sound", "alert"],
		},
	},
};

export default config;
