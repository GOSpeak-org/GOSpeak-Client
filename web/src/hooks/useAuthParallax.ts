import { useEffect, type CSSProperties, type RefObject } from "react";

/** 视差层 CSS 变量：React.CSSProperties 不含自定义属性，用索引签名收敛类型 */
type ParallaxStyleVars = CSSProperties & Record<`--${string}`, string>;

/**
 * 鼠标视差：目标点做 lerp 缓动，写入 --px/--py，各层按 --depth 取位移。
 * 尊重 prefers-reduced-motion。
 */
export function useAuthParallax(shellRef: RefObject<HTMLDivElement | null>) {
	useEffect(() => {
		if (typeof window === "undefined") return;
		const noHover = window.matchMedia("(hover: none)").matches;
		if (noHover) return;
		const reducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		if (reducedMotion) return;

		let targetX = 0;
		let targetY = 0;
		let curX = 0;
		let curY = 0;
		let raf = 0;
		const onMove = (e: MouseEvent) => {
			targetX = e.clientX / window.innerWidth - 0.5;
			targetY = e.clientY / window.innerHeight - 0.5;
			if (raf === 0) raf = requestAnimationFrame(tick);
		};
		const tick = () => {
			curX += (targetX - curX) * 0.08;
			curY += (targetY - curY) * 0.08;
			const el = shellRef.current;
			if (el) {
				el.style.setProperty("--px", curX.toFixed(4));
				el.style.setProperty("--py", curY.toFixed(4));
			}
			if (
				Math.abs(targetX - curX) < 0.001 &&
				Math.abs(targetY - curY) < 0.001
			) {
				curX = 0;
				curY = 0;
				raf = 0;
				return;
			}
			raf = requestAnimationFrame(tick);
		};
		window.addEventListener("mousemove", onMove);
		raf = requestAnimationFrame(tick);
		return () => {
			window.removeEventListener("mousemove", onMove);
			cancelAnimationFrame(raf);
		};
	}, [shellRef]);
}

export function depth(n: number): ParallaxStyleVars {
	return { "--depth": String(n) };
}
