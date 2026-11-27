import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getConversationMessages: vi.fn(async () => ({ messages: [] })),
	markConversationRead: vi.fn(async () => undefined),
	cacheGetMessages: vi.fn(async () => [] as unknown[]),
}));

vi.mock("@/api/conversation", () => ({
	listConversations: vi.fn(async () => []),
	getConversationMessages: mocks.getConversationMessages,
	markConversationRead: mocks.markConversationRead,
	sendDirectMessage: vi.fn(async () => ({})),
}));
vi.mock("@/api/message", () => ({ listMessages: vi.fn() }));
vi.mock("@/utils/idb-cache", () => ({
	chatCache: {
		getConversations: vi.fn(async () => []),
		setConversations: vi.fn(async () => undefined),
		getMessages: mocks.cacheGetMessages,
		appendMessages: vi.fn(async () => undefined),
		renameConversation: vi.fn(async () => undefined),
	},
}));
vi.mock("@gospeak/components", () => ({ toast: { error: vi.fn() } }));
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

beforeEach(() => {
	vi.clearAllMocks();
	useChatStore.setState({
		conversations: [],
		pmMessages: {},
		activeConversationID: null,
		loadingMessages: {},
	});
});

describe("chatStore local conversation", () => {
	it("keeps the peer avatar when starting a local conversation", async () => {
		await chatStore.startConversation(
			"admin",
			"管理员",
			"/uploads/avatars/admin.png",
		);

		expect(useChatStore.getState().conversations[0]?.other_avatar).toBe(
			"/uploads/avatars/admin.png",
		);
	});

	it("does not request server history for a local placeholder conversation", async () => {
		await chatStore.startConversation("admin", "管理员", "");
		await chatStore.selectConversation("pm_admin");

		expect(mocks.getConversationMessages).not.toHaveBeenCalled();
		expect(mocks.markConversationRead).not.toHaveBeenCalled();
		expect(useChatStore.getState().loadingMessages.pm_admin).toBe(false);
	});

	it("carries author info on optimistic private messages", async () => {
		await chatStore.startConversation("bob", "Bob", "");
		chatStore.sendDirect("pm_bob", "hello");

		const msg = useChatStore.getState().pmMessages.pm_bob?.[0];
		expect(msg?.author_avatar).toBe("/uploads/me.png");
		expect(msg?.author_name).toBe("管理员");
	});
});
