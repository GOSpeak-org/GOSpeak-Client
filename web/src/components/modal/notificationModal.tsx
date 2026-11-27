import { Dialog, DialogContent, DialogTitle } from "@gospeak/components";
import { ArrowLeft, Bell, BellOff, Inbox, Pin, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
	LoadingRegion,
	SkeletonNotificationDetail,
	SkeletonNotificationList,
} from "@/components/common/Skeletons";
import MarkdownText from "@/components/textRoom/MarkdownText";
import type { AnnouncementDTO } from "@/protocol/announcement";
import {
	notificationStore,
	useNotificationStore,
} from "@/stores/notificationStore";

const SCOPE_LABELS: Record<AnnouncementDTO["scope_type"], string> = {
	platform: "全站",
	domain: "域内",
};

const LEVEL_LABELS: Record<AnnouncementDTO["level"], string> = {
	info: "提示",
	warning: "警告",
	critical: "重要",
};

const LEVEL_STYLES: Record<AnnouncementDTO["level"], string> = {
	info: "border-info/30 bg-info/10 text-info",
	warning: "border-warning/30 bg-warning/10 text-warning",
	critical: "border-destructive/30 bg-destructive/10 text-destructive",
};

const BADGE_BASE =
	"inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 text-2xs leading-4";
const SCOPE_BADGE = `${BADGE_BASE} bg-muted text-muted-foreground`;
const LEVEL_BADGE_BASE = `${BADGE_BASE} border`;

function formatTime(ms: number): string {
	const date = new Date(ms);
	return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

interface NotificationModalProps {
	open: boolean;
	onClose: () => void;
}

export default function NotificationModal({
	open,
	onClose,
}: NotificationModalProps) {
	const items = useNotificationStore((s) => s.items);
	const loading = useNotificationStore((s) => s.loading);
	const unreadCount = useNotificationStore((s) => s.unreadCount);
	const [selected, setSelected] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		void notificationStore.loadList();
	}, [open]);

	if (!open) return null;

	const current = items.find((item) => item.uuid === selected) ?? items[0];
	const showSkeleton = loading && items.length === 0;

	const select = (item: AnnouncementDTO) => {
		setSelected(item.uuid);
		void notificationStore.markRead(item.uuid);
	};

	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent
				showClose={false}
				className="flex w-[min(94vw,820px)] max-w-[min(94vw,820px)] min-h-[min(72dvh,540px)] max-h-[min(86dvh,720px)] flex-col gap-0 overflow-hidden p-0 @container"
			>
				<div className="border-border flex shrink-0 items-center justify-between border-b px-3 py-2 pt-[env(safe-area-inset-top)] @md:px-4 @md:py-3">
					<div className="flex items-center gap-2">
						<Bell size={16} />
						<DialogTitle className="text-base font-semibold">通知</DialogTitle>
					</div>
					<div className="flex items-center gap-1">
						{unreadCount > 0 && (
							<button
								type="button"
								onClick={() => void notificationStore.markAllRead()}
								className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-sm px-2 py-1.5 text-xs transition-colors"
							>
								全部已读
							</button>
						)}
						<button
							type="button"
							onClick={onClose}
							className="hover:bg-muted flex size-11 items-center justify-center rounded-sm"
							aria-label="关闭"
						>
							<X size={16} />
						</button>
					</div>
				</div>

				<div className="flex min-h-0 flex-1">
					<div
						className={`border-border w-full shrink-0 overflow-y-auto border-r @md:w-72 ${
							selected ? "hidden @md:block" : "block"
						}`}
					>
						{showSkeleton ? (
							<LoadingRegion label="正在加载通知列表">
								<SkeletonNotificationList />
							</LoadingRegion>
						) : items.length === 0 ? (
							<div className="text-faint-foreground flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
								<BellOff size={24} />
								<p className="text-sm font-medium">暂无通知</p>
								<p className="text-xs">有新公告时会显示在这里</p>
							</div>
						) : (
							items.map((item) => {
								const isSelected = current?.uuid === item.uuid;
								return (
									<button
										key={item.uuid}
										type="button"
										onClick={() => select(item)}
										className={`border-border hover:bg-muted flex w-full flex-col items-start gap-1.5 border-b border-l-2 px-3 py-2.5 text-left ${
											isSelected
												? "border-l-primary bg-selected"
												: "border-l-transparent"
										}`}
									>
										<div className="flex w-full items-center gap-1.5">
											{!item.is_read && (
												<span className="bg-primary size-1.5 shrink-0 rounded-full" />
											)}
											<span
												className={`min-w-0 flex-1 truncate text-sm ${
													item.is_read
														? "font-medium text-muted-foreground"
														: "font-semibold"
												}`}
											>
												{item.title}
											</span>
											{item.pinned && (
												<>
													<Pin
														size={12}
														className="text-faint-foreground shrink-0"
													/>
													<span className="sr-only">置顶</span>
												</>
											)}
										</div>
										<div className="text-muted-foreground flex w-full items-center gap-1.5 text-2xs">
											<span className={SCOPE_BADGE}>
												{SCOPE_LABELS[item.scope_type]}
											</span>
											<span
												className={`${LEVEL_BADGE_BASE} ${LEVEL_STYLES[item.level]}`}
											>
												{LEVEL_LABELS[item.level]}
											</span>
											<span className="ml-auto shrink-0">
												{formatTime(item.published_at ?? item.created_at)}
											</span>
										</div>
									</button>
								);
							})
						)}
					</div>

					<div
						className={`min-w-0 flex-1 overflow-y-auto p-5 @md:p-6 ${
							selected ? "block" : "hidden @md:block"
						}`}
					>
						{selected && (
							<button
								type="button"
								onClick={() => setSelected(null)}
								className="hover:bg-muted mb-3 flex size-11 cursor-pointer items-center justify-center rounded-sm @md:hidden"
								aria-label="返回通知列表"
							>
								<ArrowLeft size={20} />
							</button>
						)}
						{showSkeleton ? (
							<LoadingRegion label="正在加载通知详情">
								<SkeletonNotificationDetail />
							</LoadingRegion>
						) : current ? (
							<article className="flex flex-col">
								<h2
									className={`text-lg ${
										current.is_read
											? "font-medium text-muted-foreground"
											: "font-semibold"
									}`}
								>
									{!current.is_read && (
										<span className="bg-primary mr-2 inline-block size-1.5 shrink-0 rounded-full align-middle" />
									)}
									{current.title}
								</h2>
								<div className="border-border text-muted-foreground mt-3 flex flex-wrap items-center gap-2 border-b pb-3 text-xs">
									<span className={SCOPE_BADGE}>
										{SCOPE_LABELS[current.scope_type]}
									</span>
									<span
										className={`${LEVEL_BADGE_BASE} ${LEVEL_STYLES[current.level]}`}
									>
										{LEVEL_LABELS[current.level]}
									</span>
									<span aria-hidden="true">·</span>
									<span>{current.created_by_name}</span>
									<span aria-hidden="true">·</span>
									<span>
										{formatTime(current.published_at ?? current.created_at)}
									</span>
								</div>
								<MarkdownText
									text={current.content}
									className="mt-4 max-w-prose"
								/>
							</article>
						) : (
							<div className="text-faint-foreground flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm">
								<Inbox size={24} />
								<span>选择一条通知查看详情</span>
							</div>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
