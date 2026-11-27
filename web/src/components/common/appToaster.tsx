import { Toaster } from "@gospeak/components";
import { useThemeStore } from "@/stores/themeStore";

/**
 * 全局 toast 挂载点。
 *
 * 必须在应用根部渲染一次，否则所有 `toast.*` 调用都是空操作。
 * sonner 的 theme 走 prefers-color-scheme，与应用内手动的 `.dark` class 不同步，
 * 所以这里订阅主题 store 显式传入，保证深色模式下 toast 配色一致。
 *
 * toast 固定在右下角并将容器层级压到 z-40：既不遮挡页头/搜索框，也低于 dialog 遮罩（z-50）。
 * 不启用 sonner 默认 closeButton：它绝对定位在卡片左上角外侧，视觉上像悬浮杂点；
 * 关闭后由 duration 自动消失，用户也可滑动关闭。
 */
export default function AppToaster() {
	const isDark = useThemeStore((s) => s.isDark);
	return (
		<Toaster
			richColors
			position="bottom-right"
			theme={isDark ? "dark" : "light"}
			offset={{ top: 16, right: 16, bottom: 16 }}
			mobileOffset={{ top: 16, right: 16, bottom: 16 }}
			style={{ zIndex: 40 }}
			toastOptions={{ duration: 4000 }}
		/>
	);
}
