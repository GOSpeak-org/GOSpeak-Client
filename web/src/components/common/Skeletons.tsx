// biome-ignore-all lint/suspicious/noArrayIndexKey: 骨架占位行/块数量固定，无业务主键可用
import { Skeleton } from "@gospeak/components";
import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

/** 加载区域的语义外壳：role=status + sr-only 文案，骨架块自身对读屏隐藏。 */
export function LoadingRegion({
	label = "加载中",
	className,
	children,
}: {
	label?: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			role="status"
			aria-live="polite"
			aria-busy="true"
			aria-label={label}
			className={`h-full w-full ${className ?? ""}`}
		>
			<span className="sr-only">{label}</span>
			{children}
		</div>
	);
}

export function SkeletonLine({ className }: { className?: string }) {
	return <Skeleton className={`h-4 ${className ?? "w-full"}`} />;
}

/** 表格骨架：rows 行、每行 cols 列等宽占位。 */
export function SkeletonTableRows({
	rows = 5,
	cols = 4,
	className,
}: {
	rows?: number;
	cols?: number;
	className?: string;
}) {
	return (
		<div
			data-skeleton="table"
			className={`flex flex-col gap-3 p-3 ${className ?? ""}`}
		>
			{Array.from({ length: rows }).map((_, r) => (
				<div key={r} className="flex items-center gap-3">
					{Array.from({ length: cols }).map((_, c) => (
						<Skeleton key={c} className="h-4 flex-1" />
					))}
				</div>
			))}
		</div>
	);
}

/** 列表骨架：圆形头像 + 两行文字，用于会话/成员/分组等竖列表。 */
export function SkeletonListRows({
	rows = 5,
	className,
}: {
	rows?: number;
	className?: string;
}) {
	return (
		<div
			data-skeleton="list"
			className={`flex flex-col gap-3 p-3 ${className ?? ""}`}
		>
			{Array.from({ length: rows }).map((_, i) => (
				<div key={i} className="flex items-center gap-3">
					<Skeleton className="size-8 shrink-0 rounded-full" />
					<div className="flex min-w-0 flex-1 flex-col gap-1.5">
						<Skeleton className="h-3.5 w-1/3" />
						<Skeleton className="h-3 w-2/3" />
					</div>
				</div>
			))}
		</div>
	);
}

/**
 * 消息区骨架：几何对齐真实消息行（头像 36px + 昵称行 + 正文行），
 * 行高与 ChatWindow virtualizer 的 estimateSize（日期 40 / 消息 72）保持一致，
 * 避免骨架切到真实内容时总高度跳变。
 */
export function SkeletonChatMessages({ rows = 6 }: { rows?: number }) {
	return (
		<div data-skeleton="chat-messages" className="flex flex-col">
			<Skeleton className="mt-4 mb-1 h-4 w-28" />
			{Array.from({ length: rows }).map((_, i) => (
				<div key={i} className="flex h-[72px] gap-3 px-4 py-1">
					<Skeleton className="mt-0.5 size-9 shrink-0 rounded-full" />
					<div className="flex min-w-0 flex-1 flex-col gap-2">
						<Skeleton className="h-3.5 w-24" />
						<Skeleton className="h-4 w-3/4" />
					</div>
				</div>
			))}
		</div>
	);
}

/** 通知列表骨架：几何对齐通知条目（未读圆点 + 标题行 + 范围/时间行）。 */
export function SkeletonNotificationList({ rows = 6 }: { rows?: number }) {
	return (
		<div data-skeleton="notification-list" className="flex flex-col">
			{Array.from({ length: rows }, (_, i) => (
				<div
					key={i}
					className="border-border flex w-full flex-col items-start gap-1 border-b px-3 py-2.5"
				>
					<div className="flex w-full items-center gap-1.5">
						<Skeleton className="size-1.5 shrink-0 rounded-full" />
						<Skeleton className="h-3.5 w-2/3" />
					</div>
					<div className="flex items-center gap-2">
						<Skeleton className="h-2.5 w-6" />
						<Skeleton className="h-2.5 w-14" />
					</div>
				</div>
			))}
		</div>
	);
}

/** 通知详情骨架：标题 + 元信息 + 多行正文，间距对齐弹窗详情（mb-1 / mb-4）。 */
export function SkeletonNotificationDetail() {
	return (
		<div data-skeleton="notification-detail" className="flex flex-col">
			<Skeleton className="mb-1 h-6 w-1/2" />
			<Skeleton className="mb-4 h-3 w-1/3" />
			<div className="flex flex-col gap-2.5">
				<Skeleton className="h-3.5 w-full" />
				<Skeleton className="h-3.5 w-full" />
				<Skeleton className="h-3.5 w-4/5" />
				<Skeleton className="h-3.5 w-2/3" />
			</div>
		</div>
	);
}

/**
 * 图标栏骨架：几何与 OptionSquare（size-12 / rounded-xl / gap-2）完全一致。
 * 侧栏是 w-16 的纯图标轨道，不能复用带头像+两行文字的 SkeletonListRows——
 * 那会把文字挤出轨道只剩圆圈，且加载完成时行数塌陷导致整条轨道跳动。
 */
export function SkeletonIconRail({ count = 1 }: { count?: number }) {
	return (
		<div data-skeleton="icon-rail" className="flex flex-col items-center gap-2">
			{Array.from({ length: count }, (_, i) => (
				<Skeleton key={i} className="size-12 shrink-0 rounded-xl" />
			))}
		</div>
	);
}

/** 卡片网格骨架：用于域卡片等网格布局。 */
export function SkeletonCardGrid({
	cards = 4,
	columns = 2,
	className,
}: {
	cards?: number;
	columns?: number;
	className?: string;
}) {
	const gridCols =
		columns >= 3
			? "sm:grid-cols-2 lg:grid-cols-3"
			: columns === 2
				? "sm:grid-cols-2"
				: "";
	return (
		<div
			data-skeleton="card-grid"
			className={`grid gap-3 ${gridCols} ${className ?? ""}`}
		>
			{Array.from({ length: cards }).map((_, i) => (
				<div key={i} className="border-border rounded-lg border p-4">
					<div className="flex items-center gap-3">
						<Skeleton className="size-10 shrink-0 rounded-lg" />
						<div className="flex flex-1 flex-col gap-2">
							<Skeleton className="h-4 w-1/2" />
							<Skeleton className="h-3 w-3/4" />
						</div>
					</div>
					<Skeleton className="mt-3 h-3 w-full" />
				</div>
			))}
		</div>
	);
}

/** 表单骨架：标签 + 输入框。 */
export function SkeletonForm({
	fields = 3,
	className,
}: {
	fields?: number;
	className?: string;
}) {
	return (
		<div
			data-skeleton="form"
			className={`flex flex-col gap-4 ${className ?? ""}`}
		>
			{Array.from({ length: fields }).map((_, i) => (
				<div key={i} className="flex flex-col gap-2">
					<Skeleton className="h-3.5 w-24" />
					<Skeleton className="h-9 w-full rounded-sm" />
				</div>
			))}
		</div>
	);
}

/**
 * 应用级启动等待动画：路由 beforeLoad / chunk 加载时居中显示。
 * 桌面端标题栏高度由 --mygo-titlebar-height 扣掉，转圈始终落在可视区正中。
 */
export function AppLoadingSpinner() {
	return (
		<div
			role="status"
			aria-label="正在加载"
			className="flex min-h-[calc(100dvh-var(--mygo-titlebar-height,0px))] w-full items-center justify-center"
		>
			<LoaderCircle className="text-primary size-8 animate-spin" />
			<span className="sr-only">正在加载</span>
		</div>
	);
}

/** 整页骨架：Suspense fallback，保留既有 aria-label 契约。 */
export function SkeletonPage() {
	return (
		<LoadingRegion label="页面加载中" className="h-full p-4">
			<div className="flex h-full w-full flex-col gap-3">
				<Skeleton className="h-6 w-40" />
				<Skeleton className="h-24 w-full rounded-lg" />
				<Skeleton className="h-24 w-full rounded-lg" />
				<div className="flex gap-3">
					<Skeleton className="h-16 flex-1 rounded-lg" />
					<Skeleton className="h-16 flex-1 rounded-lg" />
				</div>
			</div>
		</LoadingRegion>
	);
}
