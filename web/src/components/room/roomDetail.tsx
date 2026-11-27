import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	Skeleton,
	Slider,
	toast,
} from "@gospeak/components";
import { clsx } from "clsx";
import {
	Ellipsis,
	Gavel,
	LogOut,
	MonitorUp,
	Volume2,
	VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RemoteVideoTrackLike } from "@gospeak/sfu-client/types";
import { createMute } from "@/api/mute";
import { fetchUserInfo } from "@/api/user";
import Avatar from "@/components/common/avatar";
import ConfirmModal from "@/components/common/ConfirmModal";
import PasswordModal from "@/components/room/components/passwordModal";
import { setMutedByIdentity, setVolumeByIdentity } from "@/handler_audio";
import { useSpeakingStore } from "@/handler_audio/speakingStore";
import { useScreenShareStore } from "@/stores/screenShareStore";
import {
	type MemberInfo,
	socketStore,
	useSocketStore,
} from "@/stores/socketStore";
import { useUserStore } from "@/stores/userStore";
import {
	useVoiceChatActions,
	useVoiceChatStore,
} from "@/stores/voiceChatStore";
import {
	isRoomPasswordError,
	localizedApiMessage,
} from "@/utils/errorMessages";
import { hasPermission } from "@/utils/permissions";
import { toastActionError } from "@/utils/toast";
import ScreenShareView from "./ScreenShareView";
import { useVoiceSessionContext } from "./VoiceSessionProvider";
import { useWatchScreenShare } from "./useWatchScreenShare";

interface ShareEntry {
	key: string;
	identity: string;
	track: RemoteVideoTrackLike;
	isLocal: boolean;
}

/** Discord 语音频道视图：参与者卡片网格 + 底部断开按钮 */
export default function RoomDetail() {
	// 语音会话由常驻 Provider 持有，切到文字频道不会中断通话
	const { selectedRoom, phase, phaseLabel, isJoined, isLoading, error, retry } =
		useVoiceSessionContext();

	const members = useSocketStore((s) => s.rooms);
	const currentRoomName = useSocketStore((s) => s.currentRoom);
	const me = useUserStore((s) => s.user);
	const myName = me?.name;
	const currentDomainUUID = socketStore.currentDomainUUID();

	const roomMembers =
		members.find(
			(r) =>
				r.name === currentRoomName &&
				(r.domain_uuid || "") === (currentDomainUUID || ""),
		)?.members ?? [];

	const sortedMembers = [...roomMembers].sort((a, b) => {
		if (a.identity === myName) return -1;
		if (b.identity === myName) return 1;
		return 0;
	});

	const containerRef = useRef<HTMLDivElement>(null);
	// 成员操作菜单的展开状态提到父层：同一时刻只允许一个卡片展开菜单。
	const [openMemberMenu, setOpenMemberMenu] = useState<string | null>(null);
	const closeMemberMenu = useCallback(() => setOpenMemberMenu(null), []);

	// 屏幕共享：候选来自远端屏幕共享 + 本人共享，切换条只展示头像与名字。
	const remoteVideos = useScreenShareStore((s) => s.remote);
	const remotePublications = useScreenShareStore((s) => s.remotePublications);
	const localSharing = useScreenShareStore((s) => s.localSharing);
	const localTrack = useScreenShareStore((s) => s.localTrack);
	const { watchScreenShare, stopWatchingScreenShare } = useWatchScreenShare();

	const sharingIdentities = useMemo(() => {
		const ids = new Set(remotePublications.map((item) => item.identity));
		if (localSharing && localTrack && myName) ids.add(myName);
		return ids;
	}, [remotePublications, localSharing, localTrack, myName]);

	const shareEntries = useMemo<ShareEntry[]>(() => {
		const entries = remoteVideos
			.filter((item) => item.source === "screen")
			.map((item) => ({
				key: `remote:${item.identity}`,
				identity: item.identity,
				track: item.track,
				isLocal: false,
			}));
		if (localSharing && localTrack) {
			entries.unshift({
				key: "local",
				identity: myName ?? "",
				track: localTrack,
				isLocal: true,
			});
		}
		return entries;
	}, [remoteVideos, localSharing, localTrack, myName]);

	const [activeKey, setActiveKey] = useState<string | null>(null);
	const [pendingIdentity, setPendingIdentity] = useState<string | null>(null);

	const switchToShare = useCallback(
		async (identity: string, key: string) => {
			if (key === activeKey) return;
			if (key === "local") {
				setActiveKey("local");
				return;
			}
			setPendingIdentity(identity);
			try {
				await Promise.resolve(watchScreenShare(identity));
				setActiveKey(key);
			} catch {
				toast.error("观看共享失败，请稍后重试");
			} finally {
				setPendingIdentity(null);
			}
		},
		[activeKey, watchScreenShare],
	);

	const handleWatchShare = useCallback(
		(identity: string) => {
			const key = identity === myName ? "local" : `remote:${identity}`;
			void switchToShare(identity, key);
		},
		[myName, switchToShare],
	);

	const activeEntry =
		shareEntries.find((entry) => entry.key === activeKey) ?? null;
	const sharedTrack = activeEntry?.track ?? null;
	const activeMember = roomMembers.find(
		(member) => member.identity === activeEntry?.identity,
	);
	const sharedLabel = activeEntry
		? activeEntry.isLocal
			? "你正在共享屏幕"
			: `${activeMember?.display_name || activeMember?.name || activeEntry.identity} 正在共享屏幕`
		: "";

	// 密码错时允许重新输入：此前"重试"只是用同一个错误密码再发一次，必然再失败
	const [reenterPassword, setReenterPassword] = useState(false);
	const failedMessage = error
		? localizedApiMessage({ response: { data: { msg: error } } }, error)
		: "";
	const needsPassword = isRoomPasswordError({
		response: { data: { msg: error ?? "" } },
	});

	return (
		<div className="flex h-full w-full min-w-0 flex-col select-none">
			{!selectedRoom ? (
				<div className="text-faint-foreground flex h-full flex-col items-center justify-center gap-2 text-xs">
					<Volume2 size={32} strokeWidth={1.5} />
					<span>请从左侧选择一个房间</span>
				</div>
			) : !isJoined ? (
				/* 未加入时状态直接作为面板内容，而不是盖在成员网格上的浮层卡片：
				   房间页此时还没有成员可看，浮层只会多一层阴影和一块背景。 */
				<JoinStatus
					roomName={selectedRoom.name}
					failed={phase === "failed"}
					message={failedMessage || phaseLabel}
					loadingLabel={isLoading ? phaseLabel : "准备加入..."}
					needsPassword={needsPassword}
					onRetry={retry}
					onReenterPassword={() => setReenterPassword(true)}
				/>
			) : sharedTrack ? (
				<div className="bg-sunken flex min-h-0 flex-1 flex-col p-3">
					<div className="relative flex min-h-0 flex-1 items-center justify-center">
						<ScreenShareView track={sharedTrack} className="rounded-lg" />
						<div className="bg-card border-border text-foreground absolute top-3 left-3 rounded-md border px-2 py-1 text-xs shadow-sm">
							{sharedLabel}
						</div>
					</div>
					<div className="mt-3 flex shrink-0 justify-end">
						<button
							type="button"
							className="bg-card border-border text-foreground hover:bg-muted flex cursor-pointer items-center gap-1.5 rounded-sm border px-3 py-1.5 text-sm transition-colors"
							onClick={() => {
								if (activeEntry?.isLocal) {
									setActiveKey(null);
									return;
								}
								void Promise.resolve(stopWatchingScreenShare()).catch(() => {
									toast.error("退出共享失败，请稍后重试");
								});
								setActiveKey(null);
							}}
						>
							<LogOut size={14} />
							<span>{activeEntry?.isLocal ? "退出预览" : "退出共享"}</span>
						</button>
					</div>
					{shareEntries.length > 1 && (
						<div className="ds-scroll mt-3 flex shrink-0 gap-2 overflow-x-auto">
							{shareEntries.map((entry) => {
								const member = roomMembers.find(
									(item) => item.identity === entry.identity,
								);
								const displayName = entry.isLocal
									? me?.display_name || myName || "我"
									: member?.display_name || member?.name || entry.identity;
								const active = entry.key === activeEntry?.key;
								const pending = pendingIdentity === entry.identity;
								return (
									<button
										key={entry.key}
										type="button"
										disabled={pending}
										aria-label={`切换到 ${displayName} 的共享`}
										aria-pressed={active}
										className={clsx(
											"bg-card border-border text-foreground flex shrink-0 cursor-pointer items-center gap-2 rounded-sm border px-2 py-1.5 text-sm transition-colors disabled:cursor-default disabled:opacity-80",
											active ? "bg-selected" : "hover:bg-muted",
										)}
										onClick={() =>
											void switchToShare(entry.identity, entry.key)
										}
									>
										<Avatar
											src={entry.isLocal ? me?.avatar : member?.avatar}
											name={displayName}
											className="size-6"
											textClass="text-2xs"
										/>
										<span className="max-w-24 truncate">
											{pending ? "正在订阅..." : displayName}
										</span>
									</button>
								);
							})}
						</div>
					)}
				</div>
			) : (
				<div className="ds-scroll min-h-0 flex-1 overflow-y-auto p-4">
					<div
						className="box-border grid h-full min-h-[180px] w-full place-content-center gap-4"
						style={{
							gridTemplateColumns:
								"repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
						}}
						ref={containerRef}
					>
						{roomMembers.length > 0 ? (
							sortedMembers.map((member) => (
								<MemberCard
									key={member.identity}
									member={member}
									menuOpen={openMemberMenu === member.identity}
									onToggleMenu={() =>
										setOpenMemberMenu((current) =>
											current === member.identity ? null : member.identity,
										)
									}
									onCloseMenu={closeMemberMenu}
									sharing={sharingIdentities.has(member.identity)}
									onWatchShare={() => handleWatchShare(member.identity)}
									pending={pendingIdentity === member.identity}
								/>
							))
						) : (
							<div className="text-faint-foreground col-span-full flex h-32 items-center justify-center text-xs">
								已连接，等待成员加入
							</div>
						)}
					</div>
				</div>
			)}

			{/* 断开统一在左下语音状态条；麦克风/扬声器在左下用户栏，
			    文字聊天在频道标题栏，主区内不再重复放置控制按钮 */}

			{reenterPassword && selectedRoom && (
				<PasswordModal
					room={selectedRoom}
					onClose={() => {
						setReenterPassword(false);
						// 新密码已写入 selectedRoomInfo，重新取 token 才会带上它
						retry();
					}}
				/>
			)}
		</div>
	);
}

/**
 * 加入中的状态视图：房间名 + 进度 / 失败原因 + 重试。
 *
 * 直接铺在房间面板里（0.4.0 的加载样式），不做卡片、不加阴影 —— 它本来就是
 * 这个面板唯一的内容，而不是盖在内容上的对话框。
 */
function JoinStatus({
	roomName,
	failed,
	message,
	loadingLabel,
	needsPassword,
	onRetry,
	onReenterPassword,
}: {
	roomName: string;
	failed: boolean;
	message: string;
	loadingLabel: string;
	needsPassword: boolean;
	onRetry: () => void;
	onReenterPassword: () => void;
}) {
	return (
		<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
			<div className="text-foreground text-lg font-bold">{roomName}</div>
			{failed ? (
				<>
					<div className="text-destructive max-w-md text-sm">{message}</div>
					<div className="flex items-center gap-2">
						{needsPassword && (
							<button
								type="button"
								className="bg-primary text-primary-foreground inline-flex h-9 cursor-pointer items-center rounded-sm px-4 text-sm font-medium hover:opacity-90"
								onClick={onReenterPassword}
							>
								重新输入密码
							</button>
						)}
						<button
							type="button"
							className={
								needsPassword
									? "border-border hover:bg-muted inline-flex h-9 cursor-pointer items-center rounded-sm border px-4 text-sm transition-colors"
									: "bg-primary text-primary-foreground inline-flex h-9 cursor-pointer items-center rounded-sm px-4 text-sm font-medium hover:opacity-90"
							}
							onClick={onRetry}
						>
							重试
						</button>
					</div>
				</>
			) : (
				<>
					<Skeleton className="h-5 w-40" />
					<div className="text-muted-foreground text-sm">{loadingLabel}</div>
				</>
			)}
		</div>
	);
}

function MemberCard({
	member,
	menuOpen,
	onToggleMenu,
	onCloseMenu,
	sharing,
	onWatchShare,
	pending,
}: {
	member: MemberInfo;
	menuOpen: boolean;
	onToggleMenu: () => void;
	onCloseMenu: () => void;
	sharing: boolean;
	onWatchShare: () => void;
	pending: boolean;
}) {
	const isMe = member.identity === useUserStore.getState().user?.name;
	const user = useUserStore((s) => s.user);
	const displayName = isMe
		? user?.display_name ||
			member.display_name ||
			member.name ||
			member.identity
		: member.display_name || member.name || member.identity;

	// selector 只返回原始值：若写成 `otherMemberState[id] ?? { ... }`，
	// 每次渲染都会产生新对象，useSyncExternalStore 判定快照变化 →
	// 无限重渲染（React: Maximum update depth exceeded）。
	const volume = useVoiceChatStore(
		(s) => s.otherMemberState[member.identity]?.outputVolume ?? 100,
	);
	const isMuted = useVoiceChatStore(
		(s) => s.otherMemberState[member.identity]?.isMute ?? false,
	);
	const speakingIdentities = useSpeakingStore((s) => s.speakingIdentities);
	const isSpeaking = speakingIdentities.includes(member.identity);
	const { setMemberOutputVolume, setMemberMute } = useVoiceChatActions();

	useEffect(() => {
		setVolumeByIdentity(member.identity, volume / 100);
		setMutedByIdentity(member.identity, isMuted);
	}, [member.identity, volume, isMuted]);

	const [confirmKick, setConfirmKick] = useState(false);
	const [confirmBanMute, setConfirmBanMute] = useState(false);
	const [muting, setMuting] = useState(false);

	const handleBanMute = async () => {
		setMuting(true);
		try {
			// 成员在线快照已带 user_uuid 时直接用；旧路径（member:joined 未 enrich）降级查询
			const userUUID =
				member.user_uuid || (await fetchUserInfo(member.identity)).uuid;
			await createMute({
				user_uuid: userUUID,
				duration: 3600,
				permanent: false,
				reason: "",
			});
			toast.success("用户已被禁言");
		} catch (error) {
			toastActionError(error, "禁言失败");
		} finally {
			setMuting(false);
			setConfirmBanMute(false);
		}
	};

	return (
		<>
			<div
				className={clsx(
					"bg-muted relative flex aspect-video w-full min-w-0 items-center justify-center overflow-hidden rounded-lg transition-shadow",
					isSpeaking && "ring-2 ring-success",
				)}
			>
				<Avatar
					src={member.avatar}
					name={displayName}
					alt={member.name}
					className="size-20"
					textClass="text-xl"
				/>

				{sharing && (
					<button
						type="button"
						disabled={pending}
						className="bg-primary text-primary-foreground absolute right-2 bottom-9 flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 text-2xs transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-80"
						aria-label={`观看 ${displayName} 的屏幕共享`}
						onClick={onWatchShare}
					>
						<MonitorUp size={12} />
						<span>{pending ? "正在订阅共享..." : "正在共享屏幕"}</span>
					</button>
				)}

				<div className="bg-sunken absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-3 py-1.5">
					<span className="text-foreground truncate text-sm font-medium">
						{displayName}
					</span>
					{isMuted && (
						<span className="text-destructive shrink-0 text-2xs">已静音</span>
					)}
				</div>

				{!isMe && (
					<DropdownMenu
						open={menuOpen}
						onOpenChange={(open: boolean) =>
							open ? onToggleMenu() : onCloseMenu()
						}
					>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="bg-sunken text-foreground hover:bg-muted flex size-7 cursor-pointer items-center justify-center rounded-sm transition-colors"
								aria-label={`更多操作：${displayName}`}
							>
								<Ellipsis size={16} />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onClick={() => {
									setMemberMute(member.identity, !isMuted);
									setMutedByIdentity(member.identity, !isMuted);
								}}
							>
								{isMuted ? <Volume2 size={14} /> : <VolumeX size={14} />}
								<span>{isMuted ? "取消静音" : "静音"}</span>
							</DropdownMenuItem>
							{hasPermission("mute:manage") && (
								<DropdownMenuItem
									variant="destructive"
									onClick={() => setConfirmBanMute(true)}
								>
									<Gavel size={14} />
									<span>禁言</span>
								</DropdownMenuItem>
							)}
							{hasPermission("signal:kick") && (
								<DropdownMenuItem
									variant="destructive"
									onClick={() => setConfirmKick(true)}
								>
									<LogOut size={14} />
									<span>踢出房间</span>
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}

				{!isMe && (
					<div className="bg-sunken absolute top-2 left-2 flex w-40 items-center gap-1.5 rounded-sm px-2 py-1">
						<button
							type="button"
							className={clsx(
								"flex shrink-0 cursor-pointer items-center transition-colors",
								isMuted
									? "text-destructive hover:text-destructive"
									: "text-muted-foreground hover:text-foreground",
							)}
							onClick={() => {
								setMemberMute(member.identity, !isMuted);
								setMutedByIdentity(member.identity, !isMuted);
							}}
							aria-label={isMuted ? "取消静音" : "静音"}
						>
							{isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
						</button>
						<Slider
							value={[volume]}
							max={100}
							step={1}
							disabled={isMuted}
							className="w-full"
							aria-label={`${displayName} 音量`}
							onValueChange={(value) => {
								const val = value[0] ?? 0;
								setMemberOutputVolume(member.identity, val);
								setVolumeByIdentity(member.identity, val / 100);
							}}
						/>
						<button
							type="button"
							className="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer text-2xs tabular-nums transition-colors"
							onClick={() => {
								setMemberOutputVolume(member.identity, 100);
								setVolumeByIdentity(member.identity, 1);
							}}
							aria-label={`${displayName} 音量 ${volume}%，点击恢复 100%`}
						>
							{volume}%
						</button>
					</div>
				)}
			</div>

			<ConfirmModal
				open={confirmKick}
				title="移出语音房间"
				message={
					<span>确认把 {displayName} 移出当前语音房间？对方可以重新加入。</span>
				}
				confirmText="移出"
				onClose={() => setConfirmKick(false)}
				onConfirm={() => {
					const room = socketStore.currentRoom();
					if (room) socketStore.kickMember(room, member.identity);
					setConfirmKick(false);
				}}
			/>

			<ConfirmModal
				open={confirmBanMute}
				title="禁言用户"
				message={
					<span>
						确认对「{displayName}」禁言 60
						分钟？该用户在禁言期间无法发言，可在禁言管理中提前解除。
					</span>
				}
				confirmText="禁言"
				loading={muting}
				onClose={() => setConfirmBanMute(false)}
				onConfirm={() => {
					void handleBanMute();
				}}
			/>
		</>
	);
}
