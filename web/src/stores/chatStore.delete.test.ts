import { beforeEach, describe, expect, it, vi } from "vitest";

const emitAck = vi.fn();

vi.mock("@/stores/socketStore", () => ({
	socketStore: {
		getSocket: () => ({ isConnected: () => true, emitAck }),
		currentDomainUUID: () => "d1",
	},
	setPrivateNewHandler: vi.fn(),
	setMessageCreatedHandler: vi.fn(),
}));
vi.mock("@/api/message", () => ({ listMessages: vi.fn() }));
vi.mock("@/api/conversation", () => ({
	getConversationMessages: vi.fn(),
	listConversations: vi.fn(),
	markConversationRead: vi.fn(),
	sendDirectMessage: vi.fn(),
}));
vi.mock("@/stores/userStore", () => ({
	useUserStore: { getState: () => ({}), subscribe: vi.fn(() => () => {}) },
}));
vi.mock("@/stores/domainStore", () => ({
	useDomainStore: {
		getState: () => ({ currentDomainUUID: "d1" }),
		subscribe: vi.fn(() => () => {}),
	},
}));
vi.mock("@/utils/idb-cache", () => ({
	chatCache: { save: vi.fn(), get: vi.fn(), clear: vi.fn() },
}));
vi.mock("idb-keyval", () => ({
	get: vi.fn(async () => undefined),
	set: vi.fn(async () => {}),
	del: vi.fn(async () => {}),
}));
vi.mock("@gospeak/components", () => ({
	toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

import { toast } from "@gospeak/components";
import { chatStore, useChatStore } from "./chatStore";

const seed = (deleted = false) => {
	useChatStore.setState({
		textRoomName: "room-1",
		textRoomDomainUUID: "d1",
		messages: [
			{ uuid: "m1", deleted, created_at: "2026-01-01T00:00:00Z" } as never,
		],
	});
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("chatStore.deleteMessage / ACK 语义", () => {
	beforeEach(() => {
		emitAck.mockReset();
		vi.mocked(toast.error).mockReset();
	});

	it("ACK 成功时保持已删除", async () => {
		emitAck.mockResolvedValue(undefined);
		seed();
		chatStore.deleteMessage("m1");
		await flush();
		expect(useChatStore.getState().messages[0].deleted).toBe(true);
	});

	it("ACK 失败时回滚删除并提示", async () => {
		emitAck.mockRejectedValue(new Error("boom"));
		seed();
		chatStore.deleteMessage("m1");
		await flush();
		expect(useChatStore.getState().messages[0].deleted).toBe(false);
		expect(vi.mocked(toast.error)).toHaveBeenCalled();
	});

	it("原本已删除的消息失败时不重复提示回滚", async () => {
		emitAck.mockRejectedValue(new Error("boom"));
		seed(true);
		chatStore.deleteMessage("m1");
		await flush();
		expect(useChatStore.getState().messages[0].deleted).toBe(true);
	});
});
