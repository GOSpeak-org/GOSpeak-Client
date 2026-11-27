import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrivateMessageDTO, ConversationDTO } from "@/api/conversation";

const mocks = vi.hoisted(() => ({
	messages: [] as PrivateMessageDTO[],
	activeConversationID: "conv-1" as string | null,
	loadingMessages: {} as Record<string, boolean>,
	scrollToIndex: vi.fn(),
}));

const conversation: ConversationDTO = {
	conversation_id: "conv-1",
	other_identity: "bob",
	other_display_name: "Bob",
	other_avatar: "",
	last_content: "hello",
	last_sender_identity: "bob",
	last_message_at: 0,
	unread_count: 0,
};

vi.mock("@/stores/chatStore", () => ({
	useChatStore: (selector: (s: unknown) => unknown) =>
		selector({
			activeConversationID: mocks.activeConversationID,
			conversations: [conversation],
			pmMessages: mocks.activeConversationID
				? { [mocks.activeConversationID]: mocks.messages }
				: {},
			loadingMessages: mocks.loadingMessages,
		}),
	chatStore: { sendDirect: vi.fn() },
}));
vi.mock("@tanstack/react-virtual", () => ({
	useVirtualizer: () => ({
		getVirtualItems: () =>
			Array.from({ length: mocks.messages.length * 2 }, (_, index) => ({
				index,
				key: index,
				start: index * 72,
			})),
		getTotalSize: () => mocks.messages.length * 72,
		measureElement: vi.fn(),
		scrollToIndex: mocks.scrollToIndex,
	}),
}));
vi.mock("@/components/common/Skeletons", () => ({
	LoadingRegion: ({ children }: { children?: React.ReactNode }) => (
		<div data-loading-region>{children}</div>
	),
	SkeletonChatMessages: () => <div data-skeleton="chat-messages" />,
	SkeletonListRows: () => <div data-skeleton="list" />,
}));

import ChatWindow from "./chatWindow";

afterEach(() => {
	cleanup();
	mocks.messages = [];
	mocks.activeConversationID = "conv-1";
	mocks.loadingMessages = {};
	mocks.scrollToIndex.mockReset();
});

describe("ChatWindow private messages", () => {
	it("renders the message author's avatar image", () => {
		mocks.messages = [
			{
				uuid: "msg-1",
				author_id: "bob",
				author_name: "Bob",
				author_avatar: "/uploads/bob.png",
				content: "hello",
				deleted: false,
				created_at: "2026-11-20T10:00:00Z",
				conversation_id: "conv-1",
			},
		];

		render(<ChatWindow />);

		const avatar = screen.getByRole("img", { name: "Bob" });
		expect(avatar.tagName).toBe("IMG");
		expect(avatar.getAttribute("src")).toBe("/uploads/bob.png");
	});

	it("切换加载时滚动容器保持挂载，并使用聊天专用骨架", () => {
		mocks.messages = [];
		mocks.loadingMessages = { "conv-1": true };

		const { container } = render(<ChatWindow />);

		expect(container.querySelector(".ds-scroll")).toBeTruthy();
		expect(
			container.querySelector('[data-skeleton="chat-messages"]'),
		).toBeTruthy();
		expect(container.querySelector('[data-skeleton="list"]')).toBeNull();
	});

	it("切到有消息的会话时同步滚到底，不延迟到下一帧", () => {
		mocks.messages = [
			{
				uuid: "msg-1",
				author_id: "bob",
				author_name: "Bob",
				author_avatar: "",
				content: "hello",
				deleted: false,
				created_at: "2026-11-20T10:00:00Z",
				conversation_id: "conv-1",
			},
		];

		render(<ChatWindow />);

		expect(mocks.scrollToIndex).toHaveBeenCalledTimes(1);
		expect(mocks.scrollToIndex).toHaveBeenCalledWith(1, { align: "end" });
	});
});
