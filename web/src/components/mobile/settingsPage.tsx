import { Button } from "@gospeak/components";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LogOut, Palette, UserRound } from "lucide-react";
import { useState } from "react";
import { inMobile } from "@gospeak/mobile-capabilities";
import ServerUrlField from "@/components/common/serverUrlField";
import { AudioPanel } from "@/components/modal/settingModal/tab_item/audio";
import {
	OAuthBindingPanel,
	PasswordSection,
} from "@/components/modal/settingModal/tab_item/account";
import { VoicePanel } from "@/components/modal/settingModal/tab_item/voice";
import { clearSessionForServerSwitch } from "@/components/mobile/serverSwitch";
import { useUserStore } from "@/stores/userStore";

/**
 * 窄视口 / 移动端设置页（`/settings`）：Layout 在 isMobile 时导航到这里而不是弹窗，
 * 因此桌面 App 缩窄窗口同样会进入本页。账号安全相关面板与设置弹窗共用同一份组件。
 */
export default function SettingsPage() {
	const navigate = useNavigate();
	const user = useUserStore((s) => s.user);
	const logout = useUserStore((s) => s.logout);
	const [loggingOut, setLoggingOut] = useState(false);
	const mobile = inMobile();

	const doLogout = async () => {
		setLoggingOut(true);
		try {
			await logout();
		} finally {
			setLoggingOut(false);
			navigate({ to: "/login", replace: true });
		}
	};

	return (
		<div className="flex h-full flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]">
			<header className="border-border bg-card sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b px-2">
				<button
					type="button"
					aria-label="返回"
					className="hover:bg-muted flex size-9 cursor-pointer items-center justify-center rounded-sm transition-colors"
					onClick={() => navigate({ to: "/discover" })}
				>
					<ArrowLeft size={20} />
				</button>
				<h1 className="text-base font-semibold">设置</h1>
			</header>

			<div className="flex flex-col gap-3 p-3">
				<section className="bg-card border-border rounded-lg border p-4">
					<h2 className="mb-3 text-sm font-semibold">服务器</h2>
					<ServerUrlField
						mobile={mobile}
						onBeforeSwitch={clearSessionForServerSwitch}
					/>
					<p className="text-muted-foreground mt-3 text-xs">
						切换服务器会清除当前登录会话并重新加载客户端，请使用新服务器的账号重新登录。
					</p>
				</section>

				<section className="bg-card border-border rounded-lg border p-4">
					<h2 className="mb-3 text-sm font-semibold">外观</h2>
					<div className="text-muted-foreground flex items-center gap-2 text-sm">
						<Palette size={16} />
						<span>主题</span>
						<span className="text-muted-foreground ml-auto text-xs">
							跟随系统
						</span>
					</div>
				</section>

				<details className="bg-card border-border rounded-lg border">
					<summary className="cursor-pointer px-4 py-3 text-sm font-semibold select-none">
						音频设备
					</summary>
					<div className="border-border border-t p-4">
						<AudioPanel />
					</div>
				</details>

				<details className="bg-card border-border rounded-lg border">
					<summary className="cursor-pointer px-4 py-3 text-sm font-semibold select-none">
						语音行为
					</summary>
					<div className="border-border border-t p-4">
						<VoicePanel />
					</div>
				</details>

				<section className="bg-card border-border rounded-lg border p-4">
					<h2 className="mb-3 text-sm font-semibold">账号</h2>
					<div className="flex items-center gap-3">
						<UserRound className="text-muted-foreground" size={32} />
						<div className="min-w-0 flex-1">
							<div className="truncate text-sm font-medium">
								{user?.display_name || user?.name || "未登录"}
							</div>
							<div className="text-muted-foreground text-xs">
								{user?.role ?? ""}
							</div>
						</div>
					</div>
					<PasswordSection />
					<OAuthBindingPanel />
					<Button
						variant="outline"
						className="mt-4 w-full"
						disabled={loggingOut || !user}
						onClick={() => void doLogout()}
					>
						<LogOut size={16} />
						{loggingOut ? "退出中…" : "退出登录"}
					</Button>
				</section>
			</div>
		</div>
	);
}
