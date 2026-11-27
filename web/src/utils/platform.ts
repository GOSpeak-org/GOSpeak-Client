import { BUILD_TARGET } from "@gospeak/desktop";

/**
 * 把构建目标写到 <html data-platform="web|desktop|mobile">，给 CSS 一个平台信号。
 *
 * 样式分支看这个属性，行为分支仍走 inDesktop() / inMobile()。
 * 幂等：重复调用只是重写同一个值。
 */
export function applyPlatformAttributes(): void {
	if (typeof document === "undefined") return;
	document.documentElement.dataset.platform = BUILD_TARGET;
}
