import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { fetchUserInfo } from "@/api/user";
import Avatar from "@/components/common/avatar";
import { LoadingRegion } from "@/components/common/Skeletons";
import { Skeleton } from "@gospeak/components";

interface UserInfoPopoverProps {
	identity: string;
	pos: { x: number; y: number };
	onClose: () => void;
	/** 列表已有的成员资料：作为首帧内容，避免骨架屏闪烁 */
	initialMember?: {
		avatar?: string;
		display_name?: string;
		name?: string;
	} | null;
}

const POPOVER_WIDTH = 224;
const POPOVER_HEIGHT = 210;
const OFFSET = 8;

export default function UserInfoPopover({
	identity,
	pos,
	onClose,
	initialMember,
}: UserInfoPopoverProps) {
	const {
		data: userData,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["user-info", identity],
		queryFn: () => fetchUserInfo(identity),
		retry: false,
	});

	// 位置同步计算：首帧即落在最终位置，避免「先出现在点击点再跳转」的闪烁
	const cardPos = useMemo(() => {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		let left = pos.x + OFFSET;
		let top = pos.y + OFFSET;
		if (pos.x + OFFSET + POPOVER_WIDTH > vw) {
			left = pos.x - POPOVER_WIDTH - OFFSET;
		}
		if (pos.y + OFFSET + POPOVER_HEIGHT > vh) {
			top = pos.y - POPOVER_HEIGHT - OFFSET;
		}
		return {
			left: Math.max(8, Math.min(left, vw - POPOVER_WIDTH - 8)),
			top: Math.max(8, Math.min(top, vh - POPOVER_HEIGHT - 8)),
		};
	}, [pos.x, pos.y]);

	useEffect(() => {
		const onScroll = () => onClose();
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("scroll", onScroll, true);
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("resize", onScroll);
		return () => {
			window.removeEventListener("scroll", onScroll, true);
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("resize", onScroll);
		};
	}, [onClose]);

	const hasInitial = !!initialMember;
	const showSkeleton = isLoading && !hasInitial;
	const showError = !isLoading && (isError || !userData) && !hasInitial;

	// 首帧用列表资料，接口返回后覆盖为权威值
	const displayName =
		userData?.display_name ||
		initialMember?.display_name ||
		userData?.name ||
		initialMember?.name ||
		identity;
	const handle = userData?.name || initialMember?.name || identity;
	const avatar = userData?.avatar ?? initialMember?.avatar ?? "";

	return createPortal(
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click to close */}
			<div className="fixed inset-0 z-dropdown" onClick={onClose} />
			<div
				className="border-border bg-popover fixed z-dialog w-56 overflow-hidden rounded-lg border shadow-xl"
				style={{ left: `${cardPos.left}px`, top: `${cardPos.top}px` }}
			>
				{showSkeleton ? (
					<LoadingRegion label="正在加载用户信息">
						<div className="flex flex-col items-center gap-3 p-4">
							<Skeleton className="size-16 rounded-full" />
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-3 w-16" />
						</div>
					</LoadingRegion>
				) : showError ? (
					<div className="text-faint-foreground p-4 text-sm">
						{isError ? "加载失败" : "用户不存在"}
					</div>
				) : (
					<div className="flex flex-col items-center gap-3 p-4">
						<Avatar
							src={avatar}
							name={displayName}
							alt={handle}
							className="size-16"
							textClass="text-xl"
						/>
						<div className="text-center">
							<div className="text-sm font-bold">{displayName}</div>
							<div className="text-muted-foreground text-xs">@{handle}</div>
							{/* 固定占位，接口返回前不塌陷、返回后不跳动 */}
							<div className="bg-muted text-muted-foreground mt-1 inline-block min-w-8 rounded-full px-2 py-0.5 text-2xs">
								{userData?.role || "\u00A0"}
							</div>
						</div>
					</div>
				)}
			</div>
		</>,
		document.body,
	);
}
