import { useSocketStore } from "@/stores/socketStore";
import { useState } from "react";
import Avatar from "@/components/common/avatar";
import { LoadingRegion, SkeletonListRows } from "@/components/common/Skeletons";
import { type RosterMember, useMemberRoster } from "@/hooks/useMemberRoster";

interface MemberSidebarProps {
	onStartChat: (identity: string, display_name: string, avatar: string) => void;
}

function MemberRow({
	member,
	selected,
	onClick,
}: {
	member: RosterMember;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={`hover:bg-muted flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
				member.online ? "" : "text-faint-foreground"
			} ${selected ? "bg-selected" : ""}`}
			data-active={selected || undefined}
			aria-current={selected ? "true" : undefined}
			onClick={onClick}
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
				{member.display_name || member.name || member.identity}
			</span>
			{member.is_me && (
				<span className="text-faint-foreground text-2xs">你</span>
			)}
			{!member.online && (
				<span className="text-faint-foreground text-2xs shrink-0">离线</span>
			)}
		</button>
	);
}

function MemberGroup({
	title,
	members,
	emptyHint,
	selectedIdentity,
	onSelect,
}: {
	title: string;
	members: RosterMember[];
	emptyHint?: string;
	selectedIdentity: string | null;
	onSelect: (member: RosterMember) => void;
}) {
	if (members.length === 0 && !emptyHint) return null;
	return (
		<div className="mb-1">
			<div className="text-faint-foreground flex items-center gap-1 px-2 py-1 text-2xs font-bold">
				<span>{title}</span>
				<span>— {members.length}</span>
			</div>
			{members.map((member) => (
				<MemberRow
					key={member.identity}
					member={member}
					selected={member.identity === selectedIdentity}
					onClick={() => onSelect(member)}
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

export default function MemberSidebar({ onStartChat }: MemberSidebarProps) {
	const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);
	const connected = useSocketStore((s) => s.connected);
	const roster = useMemberRoster();

	const hasGroups = roster.online.length > 0 || roster.offline.length > 0;

	const handleClick = (member: RosterMember) => {
		setSelectedIdentity(member.identity);
		onStartChat(
			member.identity,
			member.display_name || member.name || member.identity,
			member.avatar,
		);
	};

	return (
		<div className="border-border ml-auto flex h-full w-52 shrink-0 flex-col overflow-hidden border-l">
			<div className="border-border text-muted-foreground flex h-10 items-center border-b px-3 text-xs font-bold">
				成员 ({roster.total})
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
				{!connected && !hasGroups ? (
					<LoadingRegion label="正在加载成员">
						<SkeletonListRows rows={6} />
					</LoadingRegion>
				) : hasGroups ? (
					<>
						<MemberGroup
							title="在线"
							members={roster.online}
							emptyHint="暂无在线成员"
							selectedIdentity={selectedIdentity}
							onSelect={handleClick}
						/>
						<MemberGroup
							title="离线"
							members={roster.offline}
							selectedIdentity={selectedIdentity}
							onSelect={handleClick}
						/>
					</>
				) : (
					<div className="text-faint-foreground flex h-20 items-center justify-center text-xs">
						{connected ? "暂无成员" : "正在连接服务器，成员列表加载中…"}
					</div>
				)}
			</div>
		</div>
	);
}
