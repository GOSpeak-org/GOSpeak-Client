/**
 * 构建期条件编译工具集（与 @gospeak/desktop 的 conditional.ts 同构）。
 *
 * 1. 编译期常量 __GOSPEAK_MOBILE__ / __GOSPEAK_TARGET__ 由打包器 define 注入，
 *    在调用处写 if 即可常量折叠，死分支连同其中的 import() 一并剔除。
 * 2. 运行时检测 isCapacitor() 兜底「web 构建被原生壳打开」的 dev 场景。
 *
 * inMobile() 是两者的合成，用于 UI 条件渲染；模块级裁剪用 token。
 */

export type BuildTarget = "web" | "desktop" | "mobile";

export const BUILD_TARGET: BuildTarget =
	typeof __GOSPEAK_TARGET__ === "undefined" ? "web" : __GOSPEAK_TARGET__;

export const MOBILE_BUILD: boolean = BUILD_TARGET === "mobile";

export const DESKTOP_BUILD: boolean = BUILD_TARGET === "desktop";

export const WEB_BUILD: boolean = !MOBILE_BUILD && !DESKTOP_BUILD;

interface CapacitorGlobal {
	Capacitor?: { isNativePlatform?: () => boolean };
}

export function isCapacitor(): boolean {
	const holder = globalThis as CapacitorGlobal;
	const native = holder.Capacitor;
	if (!native || typeof native.isNativePlatform !== "function") return false;
	try {
		return native.isNativePlatform() === true;
	} catch {
		return false;
	}
}

export function inMobile(): boolean {
	if (MOBILE_BUILD) return true;
	return isCapacitor();
}

export function assertMobile(feature: string): void {
	if (!inMobile()) {
		throw new Error(
			`[gospeak/mobile] "${feature}" 仅在移动端可用（当前既非 mobile 构建，也没有 Capacitor 运行时）。` +
				"请用 __GOSPEAK_MOBILE__ / inMobile() 守卫调用点，或改用移动构建（GOSPEAK_TARGET=mobile）。",
		);
	}
}

export function ifMobile<T>(mobile: () => T, fallback: () => T): T {
	return __GOSPEAK_MOBILE__ ? mobile() : fallback();
}

export async function importMobile<M>(
	loader: () => Promise<M>,
): Promise<M | null> {
	if (!__GOSPEAK_MOBILE__) return null;
	return loader();
}
