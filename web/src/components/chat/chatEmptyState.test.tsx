import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationDTO } from "@/api/conversation";

const mocks = vi.hoisted(() => ({
	conversations: [] as ConversationDTO[],
	loadingList: false,
	selectConversation: vi.fn(),
}));

vi.mock("@/stores/chatStore", () => ({
	useChatStore: (selector: (s: unknown) => unknown) =>
		selector({
			conversations: mocks.conversations,
			loadingList: mocks.loadingList,
		}),
	chatStore: {
		selectConversation: (...args: unknown[]) =>
			mocks.selectConversation(...args),
	},
}));

vi.mock("@/components/common/avatar", () => ({
	default: ({ name }: { name: string }) => <span>{name}</span>,
}));

import ChatEmptyState from "./chatEmptyState";

afterEach(() => {
	cleanup();
	mocks.conversations = [];
	mocks.loadingList = false;
	mocks.selectConversation.mockReset();
});

const sampleConversation: ConversationDTO = {
	conversation_id: "conv-1",
	other_identity: "mengmeng",
	other_display_name: "mengmeng",
	other_avatar: "",
	last_content: "TEST-D-TO-M...",
	last_sender_identity: "mengmeng",
	last_message_at: 0,
	unread_count: 2,
};

describe("ChatEmptyState", () => {
	it("不渲染可点击的会话列表（选会话走左侧 ConversationList）", () => {
		mocks.conversations = [sampleConversation];

		render(<ChatEmptyState />);

		expect(screen.queryByText("mengmeng")).toBeNull();
		expect(screen.queryByText("TEST-D-TO-M...")).toBeNull();
		expect(screen.queryByRole("button")).toBeNull();
	});

	it("引导用户从左侧会话列表或右侧成员发起会话", () => {
		mocks.conversations = [sampleConversation];

		render(<ChatEmptyState />);

		expect(screen.getByText("选择一个会话")).toBeTruthy();
		expect(screen.getByText(/左侧会话列表/)).toBeTruthy();
	});
});
