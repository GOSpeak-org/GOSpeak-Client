import { useEffect, useState } from "react";

/** 主输入设备没有悬停能力（触屏）。与构建目标无关：触摸笔记本接了鼠标就按鼠标算。 */
const COARSE_POINTER_QUERY = "(hover: none)";

export function useCoarsePointer(): boolean {
	const [coarse, setCoarse] = useState(
		() =>
			typeof window !== "undefined" &&
			window.matchMedia(COARSE_POINTER_QUERY).matches,
	);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const mq = window.matchMedia(COARSE_POINTER_QUERY);
		const sync = () => setCoarse(mq.matches);
		sync();
		mq.addEventListener("change", sync);
		return () => mq.removeEventListener("change", sync);
	}, []);

	return coarse;
}
