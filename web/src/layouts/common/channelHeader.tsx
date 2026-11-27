import {
	Hash,
	Headphones,
	MessageSquare,
	Users,
	Volume2,
	X,
} from "lucide-react";
import { iconButtonClass } from "@/layouts/common/iconButtonClass";
import { useChatStore } from "@/stores/chatStore";
import { useTextRoomUiStore } from "@/stores/textRoomUiStore";
import { useWorkspaceUiStore } from "@/stores/workspaceUiStore";

interface ChannelHeaderProps {
	kind: "voice" | "text" | "empty";
	name: string;
	description?: string;
}

/** Discord 的 48px 频道标题栏：横跨主舞台与右侧侧栏 */
export default function ChannelHeader({
	kind,
	name,
	description,
}: ChannelHeaderProps) {
	const chatOpen = useWorkspaceUiStore((s) => s.chatOpen);
	const membersOpen = useWorkspaceUiStore((s) => s.membersOpen);
	const toggleChat = useWorkspaceUiStore((s) => s.toggleChat);
	const toggleMembers = useWorkspaceUiStore((s) => s.toggleMembers);
	const textRoom = useChatStore((s) => s.textRoom);
	const textRoomName = useChatStore((s) => s.textRoomName);
	const threadParent = useTextRoomUiStore((s) => s.threadParent);
	const exitThread = useTextRoomUiStore((s) => s.exitThread);

	const Icon = kind === "voice" ? Volume2 : kind === "text" ? Hash : Headphones;

	return (
		<header className="border-border relative z-10 flex h-10 shrink-0 items-center gap-2 border-b px-3">
			<Icon size={20} className="text-muted-foreground shrink-0" />
			<span className="text-foreground truncate text-sm font-semibold">
				{name}
			</span>
			{description && (
				<>
					<span className="bg-border mx-1 hidden h-5 w-px shrink-0 sm:block" />
					<span className="text-muted-foreground hidden truncate text-xs sm:block">
						{description}
					</span>
				</>
			)}

			<div className="ml-auto flex shrink-0 items-center gap-1">
				{threadParent && (
					<button
						type="button"
						className="bg-selected text-foreground mr-1 inline-flex h-7 cursor-pointer items-center gap-1 rounded-sm px-2 text-xs"
						onClick={exitThread}
						title="退出线程视图"
					>
						线程视图 <X size={12} />
					</button>
				)}

				{textRoom && (
					<button
						type="button"
						className={iconButtonClass}
						data-active={chatOpen}
						onClick={toggleChat}
						title="显示/隐藏文字聊天"
						aria-label="显示/隐藏文字聊天"
						aria-pressed={chatOpen}
					>
						<MessageSquare size={16} />
					</button>
				)}
				<button
					type="button"
					className={iconButtonClass}
					data-active={membersOpen}
					onClick={toggleMembers}
					title="显示成员列表"
					aria-label="显示成员列表"
					aria-pressed={membersOpen}
				>
					<Users size={16} />
				</button>
			</div>
			{/* 供无障碍与后续扩展：标题栏当前频道标识 */}
			<span className="sr-only">{textRoomName ?? name}</span>
		</header>
	);
}
