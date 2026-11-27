/**
 * 屏幕共享失败时的用户提示。
 *
 * 浏览器里 NotAllowedError 通常是用户取消了系统选择器，保持静默；桌面 WebView
 * 里没有选择器，同一个错误意味着 macOS「屏幕录制」权限未授予，必须给出指引。
 */
export type PermissionStatus = "granted" | "denied" | "unknown" | "unsupported";

const GUIDE_TEXT =
	"屏幕共享需要在 系统设置 → 隐私与安全性 → 屏幕录制 中允许 GOSpeak，然后重试";

/** 共享前的权限检查未通过时返回提示文案；通过或无需检查时返回 null。 */
export function preflightBlockMessage(status: PermissionStatus): string | null {
	// macOS 在授予前一律把 Screen Recording 报为 denied/unknown，二者都需引导。
	if (status === "denied" || status === "unknown") return GUIDE_TEXT;
	return null;
}

/** 采集失败时返回应显示的文案；返回 null 表示保持静默（用户主动取消）。 */
export function shareFailureMessage(
	error: unknown,
	desktop: boolean,
): string | null {
	const name =
		error && typeof error === "object" && "name" in error
			? String((error as { name?: unknown }).name)
			: "";
	if (name === "NotAllowedError" || name === "SecurityError") {
		return desktop ? GUIDE_TEXT : null;
	}
	const message =
		error instanceof Error && error.message
			? error.message
			: "屏幕共享失败，请稍后重试";
	return `屏幕共享失败：${message}`;
}
