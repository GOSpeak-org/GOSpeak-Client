import { lazy, type ComponentType, type ReactNode } from "react";

/**
 * 管理后台的常驻页面表，供 KeepAliveOutlet 在 manage 布局里使用。
 *
 * 管理页大多是「筛选 + 分页 + 表格」的形态，切到别的 tab 再回来重挂会让
 * 搜索词、页码、展开态和滚动位置全部丢掉，并且触发一轮无谓的重新拉取。
 * 这里把静态子页（含 `/manage/domains` 列表）全部常驻。
 *
 * 动态段 `/manage/domains/$domainUUID` 依赖 match context（Route.useParams），
 * 无法脱离路由渲染，仍走 KeepAliveOutlet 的 Outlet 兜底。
 *
 * 权限校验不在这里重复：路由匹配时各子路由的 beforeLoad 仍会执行，
 * 只是渲染时用常驻实例代替 Outlet。
 */
interface PageModule {
	Route: { options: { component?: ComponentType } };
}

function pageOf(load: () => Promise<PageModule>): ComponentType {
	return lazy(async () => {
		const { Route } = await load();
		return { default: Route.options.component as ComponentType };
	});
}

const UsersPage = pageOf(() => import("@/pages/(app)/manage/users"));
const RolesPage = pageOf(() => import("@/pages/(app)/manage/roles"));
const MonitorPage = pageOf(() => import("@/pages/(app)/manage/monitor"));
const DomainsPage = pageOf(() => import("@/pages/(app)/manage/domains"));
const OAuthPage = pageOf(() => import("@/pages/(app)/manage/oauth"));
const MutePage = pageOf(() => import("@/pages/(app)/manage/mute"));
const BanPage = pageOf(() => import("@/pages/(app)/manage/ban"));
const AnnouncementsPage = pageOf(
	() => import("@/pages/(app)/manage/announcements"),
);
const StoragePage = pageOf(() => import("@/pages/(app)/manage/storage"));
const EmailPage = pageOf(() => import("@/pages/(app)/manage/email"));
const SFUPage = pageOf(() => import("@/pages/(app)/manage/sfu"));
const PluginsPage = pageOf(() => import("@/pages/(app)/manage/plugins"));

/** key 是精确 pathname（KeepAliveOutlet 的约束）。 */
export const MANAGE_KEEP_ALIVE_PAGES: Record<string, ReactNode> = {
	"/manage/users": <UsersPage />,
	"/manage/roles": <RolesPage />,
	"/manage/monitor": <MonitorPage />,
	"/manage/domains": <DomainsPage />,
	"/manage/oauth": <OAuthPage />,
	"/manage/mute": <MutePage />,
	"/manage/ban": <BanPage />,
	"/manage/announcements": <AnnouncementsPage />,
	"/manage/storage": <StoragePage />,
	"/manage/email": <EmailPage />,
	"/manage/sfu": <SFUPage />,
	"/manage/plugins": <PluginsPage />,
};
