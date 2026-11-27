import {
	createAudioRoute,
	inMobile,
	type AudioRouteKind,
	type AudioRouteOption,
} from "@gospeak/mobile-capabilities";
import { useEffect, useMemo, useState } from "react";

/**
 * 移动端音频路由选择器的状态源。
 *
 * 原生路由是权威状态：挂载时从插件拉取候选与当前值，切换后回读一次。
 * Web / 桌面目标下 inMobile() 为 false，不发起任何插件调用。
 */
export function useMobileAudioRoute() {
	const route = useMemo(() => createAudioRoute(), []);
	const [options, setOptions] = useState<AudioRouteOption[]>([]);
	const [current, setCurrent] = useState<AudioRouteKind>("speaker");

	useEffect(() => {
		if (!inMobile()) return;
		let alive = true;
		void route.list().then((list) => {
			if (alive) setOptions(list);
		});
		void route.refresh().then(() => setCurrent(route.current()));
		return () => {
			alive = false;
		};
	}, [route]);

	const select = async (kind: AudioRouteKind) => {
		await route.set(kind);
		await route.refresh();
		setCurrent(route.current());
	};

	return { options, current, select };
}
