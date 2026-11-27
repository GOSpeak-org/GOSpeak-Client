import {
	Button,
	Dialog,
	DialogContent,
	DialogTitle,
} from "@gospeak/components";
import { Info, Link2, Mic, Monitor, Palette, Volume2, X } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { TABS } from "./tab_item";
import type { SettingTabConfig } from "./tab_item/types";

interface SettingModalProps {
	open: boolean;
	onClose: () => void;
	/** 可选：打开时定位到指定 tab */
	initialTabId?: string;
}

const ICON_MAP: Record<
	SettingTabConfig["icon"],
	ComponentType<{ size?: number; className?: string }>
> = {
	mic: Mic,
	volume: Volume2,
	palette: Palette,
	monitor: Monitor,
	link: Link2,
	info: Info,
};

export default function SettingModal({
	open,
	onClose,
	initialTabId,
}: SettingModalProps) {
	const initialIndex = Math.max(
		0,
		TABS.findIndex((t) => t.id === initialTabId),
	);
	const [activeTab, setActiveTab] = useState(initialIndex);

	// 弹窗关闭再打开、或 initialTabId 变化时，同步到指定 tab（首次挂载由 useState 完成）。
	useEffect(() => {
		if (!open) return;
		const index = TABS.findIndex((t) => t.id === initialTabId);
		setActiveTab(Math.max(0, index));
	}, [open, initialTabId]);

	if (!open) return null;

	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			{/* 基础 DialogContent 默认是 grid，必须用 flex 显式覆盖（twMerge 只认同组类名）。
			    否则固定高度下 grid 会拉伸 auto 行，标题栏被撑到半屏高、内容区被压缩。 */}
			{/* 断点全部用容器查询（@container）而不是视口断点：设置弹窗的宽度由窗口决定，
			    视口 sm:/md: 在桌面端最小窗口（880）下永远成立，等于没有适配。 */}
			<DialogContent
				showClose={false}
				className="surface-glass flex h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 @container sm:h-[min(90dvh,820px)] sm:w-[calc(100vw-8rem)] sm:max-w-7xl sm:rounded-2xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
			>
				<div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
					<DialogTitle className="text-base font-semibold">设置</DialogTitle>
					<Button
						variant="ghost"
						className="size-9 shrink-0 rounded-full p-0"
						onClick={onClose}
						aria-label="关闭设置"
					>
						<X size={16} />
					</Button>
				</div>
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden select-none @3xl:flex-row">
					<aside className="border-border bg-muted flex shrink-0 gap-1 overflow-x-auto border-b p-2 @3xl:min-h-0 @3xl:w-44 @3xl:flex-col @3xl:overflow-x-hidden @3xl:overflow-y-auto @3xl:border-r @3xl:border-b-0 @5xl:w-48">
						{TABS.map((tab, index) => {
							const Icon = ICON_MAP[tab.icon];
							return (
								<button
									key={tab.id}
									type="button"
									className={`hover:bg-muted flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-sm px-3 transition-colors @3xl:h-11 @3xl:justify-start @3xl:gap-2 ${activeTab === index ? "bg-card shadow-sm" : ""}`}
									onClick={() => setActiveTab(index)}
								>
									<Icon className="opacity-80" size={16} />
									<span className="text-xs whitespace-nowrap @3xl:text-sm">
										{tab.label}
									</span>
								</button>
							);
						})}
					</aside>
					<div className="bg-card @container min-w-0 flex-1 overflow-auto">
						{(() => {
							const Active = TABS[activeTab]?.component;
							return Active ? <Active key={TABS[activeTab]?.id} /> : null;
						})()}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
