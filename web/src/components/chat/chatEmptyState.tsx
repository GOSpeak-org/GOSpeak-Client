import { MessageSquareText } from "lucide-react";

/**
 * 聊天主区空态：未选中会话时展示。
 * 会话选择由左侧 ConversationList 承担，这里只做引导，不再重复渲染可点击列表。
 */
export default function ChatEmptyState() {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center select-none">
			<div className="bg-muted border-border flex size-16 items-center justify-center rounded-full border">
				<MessageSquareText
					size={32}
					strokeWidth={1.5}
					className="text-foreground"
				/>
			</div>
			<h2 className="text-foreground text-lg font-bold">选择一个会话</h2>
			<p className="text-faint-foreground max-w-xs text-sm leading-relaxed">
				在左侧会话列表选择会话，或点击右侧成员发起私聊。切换会话不会清空聊天记录。
			</p>
		</div>
	);
}
