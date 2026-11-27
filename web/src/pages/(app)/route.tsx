import {
	createFileRoute,
	redirect,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import Layout from "@/layouts/layout";
import { ErrorBoundary } from "@/components/common/errorBoundary";
import { KeepAliveOutlet } from "@/components/common/keepAliveOutlet";
import { useUserStore } from "@/stores/userStore";

export const Route = createFileRoute("/(app)")({
	// 冷启动只读本地缓存，不等网络：有缓存用户就立刻放行，页面直接渲染出来。
	// 等会话校验会让后端不可达时的回环代理上限（12s）变成一段白屏转圈。
	// 会话到底还有没有效，交给下面组件里的后台校验和 apiClient 的 401 拦截器。
	beforeLoad: () => {
		if (useUserStore.getState().user) return;
		if (typeof window !== "undefined") {
			sessionStorage.setItem(
				"gospeak_redirect",
				window.location.pathname + window.location.search,
			);
		}
		throw redirect({ to: "/login" });
	},
	component: RouteComponent,
});

function RouteComponent() {
	const location = useLocation();
	const navigate = useNavigate();

	useEffect(() => {
		let cancelled = false;
		// 后台确认会话：页面已经画出来了，只有真的失效才送去登录页。
		void (async () => {
			const ok = await useUserStore.getState().ensureSession();
			if (!ok && !cancelled) navigate({ to: "/login", replace: true });
		})();
		// 会话走快速路径（未过期）时 profile 不会被顺带拉取，这里补一次；
		// 刚校验过则会跳过，不产生重复请求。
		useUserStore.getState().refreshUserInBackground();
		return () => {
			cancelled = true;
		};
	}, [navigate]);

	// 页面级边界：整个应用外壳（布局 + 路由出口）崩溃时给整页兜底，
	// 切换路由自动恢复，避免用户被卡在错误页。
	return (
		<ErrorBoundary
			name="app-shell"
			level="page"
			resetKeys={[location.pathname]}
			title="界面加载失败"
			description="应用界面遇到异常，错误已记录。可以重试或返回首页。"
		>
			<Layout>
				<KeepAliveOutlet />
			</Layout>
		</ErrorBoundary>
	);
}
