import { createFileRoute, redirect } from "@tanstack/react-router";
import { domainStore } from "@/stores/domainStore";
import { resolveFirstScreenFromCache } from "@/utils/firstScreen";

/**
 * 首屏分流：
 * - 有已加入的域 → 直接回到上次所在的域（校验仍在成员列表内）
 * - 还没有域     → 去发现域页引导「创建 / 加入」
 *
 * 以前无条件跳 /discover，老用户每次刷新都要在侧栏再点一次自己的域。
 */
export const Route = createFileRoute("/(app)/")({
	beforeLoad: () => {
		// 冷启动不等网络：有上次所在的域就立刻分流，首屏马上可操作。
		// 域列表在后台加载，回来时侧栏/布局按 store 更新自动纠正（退域等场景
		// 由 (app) 布局与域路由的守卫兜底），不像以前那样把整段白屏串成
		// 「会话校验 + 域列表」两道各 4–12s 的网络门。
		const { myDomainUUIDs, currentDomainUUID } = domainStore.state;
		const target = resolveFirstScreenFromCache(
			myDomainUUIDs,
			currentDomainUUID,
		);

		// 列表在后台补齐：回到域的老用户不必等它，首次进入的用户被送到发现页。
		void domainStore.loadMyDomains().catch(() => {});

		if (!target) throw redirect({ to: "/discover" });
		throw redirect({
			to: "/domain/$domainUUID",
			params: { domainUUID: target },
		});
	},
	staticData: {
		title: "工作台",
	},
});
