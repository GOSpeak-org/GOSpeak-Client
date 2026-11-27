import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import AppToaster from "@/components/common/appToaster";
import { RouteErrorComponent } from "@/components/common/errorBoundary";
import { AppLoadingSpinner } from "@/components/common/Skeletons";
import { requestAudioPermission } from "@/hooks/media";
import { initBackground } from "@/stores/backgroundStore";
import { initTheme } from "@/stores/themeStore";
import { applyPlatformAttributes } from "@/utils/platform";
import { installClientLog } from "@/utils/clientLog";
import { installDesktopLogSink } from "@/utils/clientLogDesktop";
import { installFatalWatcher } from "@/utils/clientLogFatal";
import { installGlobalErrorHandlers } from "@/utils/errorReport";
import { loadPublicBaseUrl } from "@/utils/publicBaseUrl";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 5 * 60 * 1000, // 5分钟内不重新请求
			retry: 1,
		},
	},
});

const router = createRouter({
	routeTree,
	context: { queryClient },
	defaultPreload: "intent",
	// 路由 beforeLoad（会话校验、我的域）与按路由拆分的 chunk 都要等网络；
	// 没有 pending 组件时整段等待就是一片纯白。给等待一个居中转圈 + 最短展示时间，
	// 避免「登录后先白一下」再突然出内容。
	defaultPendingComponent: AppLoadingSpinner,
	defaultPendingMs: 100,
	defaultPendingMinMs: 250,
	// 所有路由的默认错误 UI；loader 抛错时 invalidate 才会重新发起请求
	defaultErrorComponent: (props) => (
		<RouteErrorComponent {...props} onRetry={() => void router.invalidate()} />
	),
	defaultNotFoundComponent: NotFound,
});

function NotFound() {
	return (
		<div className="bg-background text-foreground flex min-h-[calc(100dvh-var(--mygo-titlebar-height,0px))] flex-col items-center justify-center gap-4">
			<span className="text-primary text-xl font-semibold">GOSpeak</span>
			<p className="text-muted-foreground text-sm">
				页面不存在，请检查地址或返回首页。
			</p>
			<a href="/" className="text-primary text-sm underline underline-offset-4">
				返回首页
			</a>
		</div>
	);
}

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

// 平台属性：CSS 侧的触控 / 桌面窗口 / 系统偏好规则按目标分支，
// 必须在首次渲染前写入，避免首帧按基线规则绘制后再跳变。
applyPlatformAttributes();

// 主题必须在应用根部应用一次：登录/注册/访客页没有 Header，
// 只在 Header 里 initTheme 会让这些页面永远停在浅色。
initTheme();

// 个人背景图：启动读 IndexedDB 并应用到 body；环境不支持时降级为不可用态。
void initBackground();

// 启动即申请麦克风权限：授权后 enumerateDevices 才给真实 deviceId / label，
// 设备变化检测与热切换都依赖它。失败不阻塞应用（拒绝授权时降级为系统默认）。
void requestAudioPermission();

// 桌面端分享链接要用后端服务器地址而不是回环 origin，先预热缓存再渲染。
void loadPublicBaseUrl();

// 客户端日志：必须在错误边界之前装上，否则启动阶段的报错会丢。
// 桌面端额外注册宿主 sink（崩溃后原生窗口读的是宿主那份）。
const uninstallDesktopLogSink = installDesktopLogSink();
const uninstallClientLog = installClientLog();

// 错误边界捕获不到事件回调 / Promise 里的错误，由全局监听补齐上报
const uninstallGlobalErrorHandlers = installGlobalErrorHandlers();

// 白屏 / 错误风暴判定：判定成立时由宿主打开原生崩溃窗口
const uninstallFatalWatcher = installFatalWatcher();

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		uninstallFatalWatcher();
		uninstallGlobalErrorHandlers();
		uninstallClientLog();
		uninstallDesktopLogSink();
	});
}

const appEl = document.getElementById("app");
if (appEl) {
	createRoot(appEl).render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
			<AppToaster />
		</QueryClientProvider>,
	);
}
