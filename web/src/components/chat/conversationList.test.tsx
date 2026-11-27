import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationDTO } from "@/api/conversation";

const mocks = vi.hoisted(() => ({
	conversations: [] as ConversationDTO[],
}));

vi.mock("@/stores/chatStore", () => ({
	useChatStore: (selector: (s: unknown) => unknown) =>
		selector({
			conversations: mocks.conversations,
			activeConversationID: null,
			loadingList: false,
		}),
	chatStore: {
		loadConversations: vi.fn(),
		selectConversation: vi.fn(),
	},
}));
vi.mock("@/components/common/AsyncState", () => ({
	default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/common/Skeletons", () => ({
	SkeletonListRows: () => null,
}));
vi.mock("@gospeak/components", () => ({
	Badge: ({ count }: { count: number }) => <span>{count}</span>,
}));

import ConversationList from "./conversationList";

afterEach(() => {
	cleanup();
	mocks.conversations = [];
});

describe("ConversationList", () => {
	it("renders the peer avatar image instead of an initial", () => {
		mocks.conversations = [
			{
				conversation_id: "conv-1",
				other_identity: "admin",
				other_display_name: "管理员",
				other_avatar: "/uploads/avatars/admin.png",
				last_content: "hi",
				last_sender_identity: "admin",
				last_message_at: 0,
				unread_count: 0,
			},
		];

		render(<ConversationList />);

		const avatar = screen.getByRole("img", { name: "admin" });
		expect(avatar.tagName).toBe("IMG");
		expect(avatar.getAttribute("src")).toBe("/uploads/avatars/admin.png");
	});
});
