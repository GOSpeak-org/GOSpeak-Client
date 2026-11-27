import { createBackButton, inMobile } from "@gospeak/mobile-capabilities";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Android 硬件返回键策略：有历史就回退，没有就退到后台。
 *
 * 不接管时 Capacitor 会按 WebView 默认行为处理，房间内误触返回会直接结束进程。
 * 移动端以外的目标 inMobile() 恒 false，不注册任何监听。
 */
export function useMobileBackButton() {
	const router = useRouter();

	useEffect(() => {
		if (!inMobile()) return;
		const back = createBackButton();
		return back.onBack(() => {
			if (router.history.canGoBack()) {
				router.history.back();
				return;
			}
			void back.minimize();
		});
	}, [router]);
}
