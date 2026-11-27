import { MicOff } from "lucide-react";
import { useState } from "react";
import Avatar from "@/components/common/avatar";
import { LoadingRegion, SkeletonListRows } from "@/components/common/Skeletons";
import { type RosterMember, useMemberRoster } from "@/hooks/useMemberRoster";
import { useSocketStore } from "@/stores/socketStore";
import MemberActionsMenu from "./memberActionsMenu";
import UserInfoPopover from "./userInfoPopover";

// ---------- MemberListItem ----------
interface MemberItemProps {
	member: RosterMember;
	onSelect: (member: RosterMember, x: number, y: number) => void;
	isSelected: boolean;
	onContextMenu: (member: RosterMember, x: number, y: number) => void;
}

function MemberListItem(props: MemberItemProps) {
	const { member } = props;
	const displayName = member.display_name || member.identity;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: 成员行的右键菜单是辅助交互，不改变元素语义
		<div
			className={`group flex w-full items-center gap-1 rounded-md px-2 py-1.5 ${
				props.isSelected ? "bg-selected" : "hover:bg-muted"
			} ${member.online ? "" : "text-faint-foreground"}`}
			onContextMenu={(e) => {
				e.preventDefault();
				e.stopPropagation();
				props.onContextMenu(member, e.clientX, e.clientY);
			}}
		>
			<button
				type="button"
				className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
				onClick={(e) => {
					const rect = e.currentTarget.getBoundingClientRect();
					const x = e.detail === 0 ? rect.right : e.clientX;
					const y = e.detail === 0 ? rect.bottom : e.clientY;
					props.onSelect(member, x, y);
				}}
			>
				<span className="relative shrink-0">
					<Avatar
						className="size-6"
						textClass="text-2xs"
						src={member.avatar}
						name={member.display_name || member.name || member.identity}
					/>
					<span
						className={`border-card absolute -right-0.5 -bottom-0.5 size-2 rounded-full border ${
							member.online ? "bg-success" : "bg-faint-foreground"
						}`}
						aria-hidden="true"
					/>
				</span>
				<span className="flex-1 truncate text-xs font-medium">
					{displayName}
				</span>
				{member.online && (member.is_mic_muted || member.is_muted) && (
					<MicOff size={12} className="text-faint-foreground shrink-0" />
				)}
				{member.is_me && (
					<span className="text-faint-foreground text-2xs">你</span>
				)}
				{!member.online && (
					<span className="text-faint-foreground text-2xs shrink-0">离线</span>
				)}
			</button>
		</div>
	);
}

function MemberGroup({
	title,
	members,
	emptyHint,
	selectedIdentity,
	onSelect,
	onContextMenu,
}: {
	title: string;
	members: RosterMember[];
	emptyHint?: string;
	selectedIdentity: string | null;
	onSelect: (member: RosterMember, x: number, y: number) => void;
	onContextMenu: (member: RosterMember, x: number, y: number) => void;
}) {
	if (members.length === 0 && !emptyHint) return null;
	return (
		<div className="mb-1">
			<div className="text-faint-foreground flex items-center gap-1 px-2 py-1 text-2xs font-bold">
				<span>{title}</span>
				<span>— {members.length}</span>
			</div>
			{members.map((member) => (
				<MemberListItem
					key={member.identity}
					member={member}
					onSelect={onSelect}
					isSelected={selectedIdentity === member.identity}
					onContextMenu={onContextMenu}
				/>
			))}
			{members.length === 0 && emptyHint && (
				<div className="text-faint-foreground px-2 py-1 text-2xs">
					{emptyHint}
				</div>
			)}
		</div>
	);
}

// ---------- MemberSidebar ----------
export default function MemberSidebar({
	fullWidth = false,
}: {
	fullWidth?: boolean;
}) {
	const [selected, setSelected] = useState<{
		identity: string;
		x: number;
		y: number;
		member: RosterMember;
	} | null>(null);
	const [contextMenu, setContextMenu] = useState<{
		member: RosterMember;
		x: number;
		y: number;
	} | null>(null);

	const closePopover = () => setSelected(null);

	const handleSelect = (member: RosterMember, x: number, y: number) => {
		setSelected((prev) =>
			prev?.identity === member.identity
				? null
				: { identity: member.identity, x, y, member },
		);
	};

	const handleContextMenu = (member: RosterMember, x: number, y: number) => {
		setSelected(null);
		setContextMenu({ member, x, y });
	};

	const roster = useMemberRoster();
	const currentRoom = useSocketStore((s) => s.currentRoom);
	const hasGroups = roster.online.length > 0 || roster.offline.length > 0;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: 面板禁用原生右键菜单，仅阻止默认行为
		<div
			className={`relative flex h-full flex-col overflow-hidden shrink-0 ${
				fullWidth ? "w-full border-0" : "border-border w-52 border-l"
			}`}
			onContextMenu={(e) => e.preventDefault()}
		>
			<div className="border-border text-muted-foreground flex h-10 items-center border-b px-3 text-xs font-bold">
				成员 ({roster.total})
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
				{roster.loading && !hasGroups ? (
					<LoadingRegion label="正在加载成员">
						<SkeletonListRows rows={6} />
					</LoadingRegion>
				) : hasGroups ? (
					<>
						<MemberGroup
							title="在线"
							members={roster.online}
							emptyHint="暂无在线成员"
							selectedIdentity={selected?.identity ?? null}
							onSelect={handleSelect}
							onContextMenu={handleContextMenu}
						/>
						<MemberGroup
							title="离线"
							members={roster.offline}
							selectedIdentity={selected?.identity ?? null}
							onSelect={handleSelect}
							onContextMenu={handleContextMenu}
						/>
					</>
				) : (
					<div className="text-faint-foreground flex h-20 items-center justify-center text-xs">
						暂无成员
					</div>
				)}
			</div>
			{selected && (
				<UserInfoPopover
					identity={selected.identity}
					pos={{ x: selected.x, y: selected.y }}
					onClose={closePopover}
					initialMember={selected.member}
				/>
			)}
			{contextMenu && currentRoom && (
				<MemberActionsMenu
					userUUID={contextMenu.member.user_uuid}
					displayName={
						contextMenu.member.display_name || contextMenu.member.identity
					}
					isSelf={contextMenu.member.is_me}
					room={currentRoom}
					pos={{ x: contextMenu.x, y: contextMenu.y }}
					onClose={() => setContextMenu(null)}
				/>
			)}
		</div>
	);
}
