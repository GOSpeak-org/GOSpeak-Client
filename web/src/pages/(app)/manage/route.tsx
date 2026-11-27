import { createFileRoute } from "@tanstack/react-router";
import { KeepAliveOutlet } from "@/components/common/keepAliveOutlet";
import { MANAGE_KEEP_ALIVE_PAGES } from "@/components/manage/manageKeepAlive";
import { denyAccess } from "@/utils/accessDenied";
import { hasManageAccess } from "@/utils/permissions";

export const Route = createFileRoute("/(app)/manage")({
	beforeLoad: () => {
		if (!hasManageAccess()) {
			denyAccess("你没有进入管理后台的权限");
		}
	},
	component: ManageLayout,
	staticData: {
		title: "管理",
	},
});

function ManageLayout() {
	return (
		<div className="manage-shell flex h-full w-full min-h-0 min-w-0 flex-col">
			{/* 管理导航由外层布局统一渲染（桌面 DynamicRender / 移动端 ManageNavMobile），
			    此处不要再放一份，否则左侧会出现两列重复菜单。 */}
			{/* 静态子页常驻（筛选/页码/滚动位置保留），动态域详情仍由 Outlet 兜底；
			    每个常驻页有自己的滚动容器，不再共用一个容器来回滚顶。 */}
			<div className="relative min-h-0 w-full flex-1">
				<KeepAliveOutlet pages={MANAGE_KEEP_ALIVE_PAGES} />
			</div>
		</div>
	);
}
