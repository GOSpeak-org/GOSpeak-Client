import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	toast,
} from "@gospeak/components";
import { useMutation } from "@tanstack/react-query";
import { UserMinus, VolumeX } from "lucide-react";
import { useState } from "react";
import { createMute } from "@/api/mute";
import ConfirmModal from "@/components/common/ConfirmModal";
import MuteDurationPicker from "@/components/manage/MuteDurationPicker";
import { socketStore } from "@/stores/socketStore";
import { hasPermission } from "@/utils/permissions";
import { toastActionError } from "@/utils/toast";

interface MemberActionsMenuProps {
	userUUID: string;
	displayName: string;
	isSelf: boolean;
	room: string;
	/** 右键坐标（视口坐标），菜单在该点弹出 */
	pos: { x: number; y: number };
	onClose: () => void;
}

const MENU_WIDTH = 176;

export default function MemberActionsMenu({
	userUUID,
	displayName,
	isSelf,
	room,
	pos,
	onClose,
}: MemberActionsMenuProps) {
	const [kickOpen, setKickOpen] = useState(false);
	const [muteOpen, setMuteOpen] = useState(false);
	const [permanent, setPermanent] = useState(false);
	const [duration, setDuration] = useState(3600);

	const canKick = !isSelf && hasPermission("signal:kick");
	const canMute = !isSelf && hasPermission("mute:manage");

	const muteMutation = useMutation({
		mutationFn: () =>
			createMute({
				user_uuid: userUUID,
				duration,
				permanent,
				reason: "房间成员管理",
			}),
		onSuccess: () => {
			toast.success(permanent ? "已永久禁言该成员" : "该成员已被禁言");
			setMuteOpen(false);
			onClose();
		},
		onError: (error) => toastActionError(error, "禁言失败"),
	});

	const handleKick = () => {
		socketStore.kickMember(room, userUUID);
		setKickOpen(false);
		onClose();
	};

	const left = Math.min(pos.x, window.innerWidth - MENU_WIDTH - 8);
	const top = Math.min(pos.y, window.innerHeight - 96);

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: 右键菜单遮罩，点击空白处关闭 */}
			<div
				className="fixed inset-0 z-popover"
				onClick={onClose}
				onContextMenu={(e) => {
					e.preventDefault();
					onClose();
				}}
			/>
			<DropdownMenu open={true} onOpenChange={(open) => !open && onClose()}>
				<DropdownMenuTrigger asChild>
					<div
						className="pointer-events-none fixed size-0"
						style={{ left, top }}
						aria-hidden="true"
					/>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					sideOffset={0}
					style={{ position: "fixed", left, top }}
					className="fixed"
				>
					{canKick && (
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => setKickOpen(true)}
						>
							<UserMinus size={15} className="shrink-0" />
							踢出房间
						</DropdownMenuItem>
					)}
					{canKick && canMute && <DropdownMenuSeparator />}
					{canMute && (
						<DropdownMenuItem onSelect={() => setMuteOpen(true)}>
							<VolumeX size={15} className="shrink-0" />
							禁言
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<ConfirmModal
				open={kickOpen}
				title="踢出房间"
				message={`确定将「${displayName}」踢出当前房间吗？`}
				confirmText="踢出"
				confirmVariant="destructive"
				onClose={() => setKickOpen(false)}
				onConfirm={handleKick}
			/>

			<ConfirmModal
				open={muteOpen}
				title="禁言成员"
				confirmText={muteMutation.isPending ? "禁言中…" : "禁言"}
				loading={muteMutation.isPending}
				confirmVariant="destructive"
				message={
					<div className="flex flex-col gap-3">
						<div>选择禁言时长，禁言期间该成员无法发言。</div>
						<MuteDurationPicker
							permanent={permanent}
							duration={duration}
							onChange={(value) => {
								setPermanent(value.permanent);
								setDuration(value.duration);
							}}
						/>
					</div>
				}
				onClose={() => {
					if (!muteMutation.isPending) setMuteOpen(false);
				}}
				onConfirm={() => muteMutation.mutate()}
			/>
		</>
	);
}
