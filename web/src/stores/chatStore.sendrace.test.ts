import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	listConversations: vi.fn(async () => [] as unknown[]),
	sendDirectMessage: vi.fn(async () => ({}) as Record<string, unknown>),
	markConversationRead: vi.fn(async () => undefined),
	getConversationMessages: vi.fn(async () => ({ messages: [] })),
	toastError: vi.fn(),
}));

vi.mock("@/api/conversation", () => ({
	listConversations: mocks.listConversations,
	sendDirectMessage: mocks.sendDirectMessage,
	getConversationMessages: mocks.getConversationMessages,
	markConversationRead: mocks.markConversationRead,
}));
vi.mock("@/api/message", () => ({ listMessages: vi.fn() }));
vi.mock("@/utils/idb-cache", () => ({
	chatCache: {
		getConversations: vi.fn(async () => []),
		setConversations: vi.fn(async () => undefined),
		getMessages: vi.fn(async () => []),
		appendMessages: vi.fn(async () => undefined),
		renameConversation: vi.fn(async () => undefined),
	},
}));
vi.mock("@gospeak/components", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/stores/userStore", () => ({
	useUserStore: {
		getState: () => ({
			user: {
				id: 1,
				uuid: "u1",
				name: "admin",
				display_name: "管理员",
				avatar: "/uploads/me.png",
				role: "admin",
			},
		}),
	},
}));
vi.mock("@/stores/socketStore", () => ({
	socketStore: { getSocket: () => null, currentDomainUUID: () => null },
	setPrivateNewHandler: vi.fn(),
	setMessageCreatedHandler: vi.fn(),
}));

import { chatStore, useChatStore } from "./chatStore";

const REAL_ID = "512d28e3cf8b99617667d3630ec95746";

beforeEach(() => {
	vi.clearAllMocks();
	useChatStore.setState({
		conversations: [],
		pmMessages: {},
		activeConversationID: null,
		loadingMessages: {},
		loadingList: false,
	});
});

describe("chatStore first-message race", () => {
	it("keeps the new conversation visible when the server list lags behind async persistence", async () => {
		mocks.sendDirectMessage.mockResolvedValue({
			uuid: "m1",
			author_id: "admin",
			author_name: "管理员",
			author_avatar: "/uploads/me.png",
			content: "hello",
			created_at: new Date().toISOString(),
			conversation_id: REAL_ID,
			target_identity: "bob",
			client_nonce: "nonce-1",
		});
		// 服务端异步落库尚未完成：列表接口还查不到刚创建的会话
		mocks.listConversations.mockResolvedValue([]);

		await chatStore.startConversation("bob", "Bob", "");
		chatStore.sendDirect("pm_bob", "hello");

		await vi.waitFor(() => {
			expect(useChatStore.getState().activeConversationID).toBe(REAL_ID);
		});

		const state = useChatStore.getState();
		expect(state.conversations.some((c) => c.conversation_id === REAL_ID)).toBe(
			true,
		);
		expect(mocks.markConversationRead).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
	});
});
