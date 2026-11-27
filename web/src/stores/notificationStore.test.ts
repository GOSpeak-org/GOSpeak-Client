import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/announcement", () => ({
	listAnnouncements: vi.fn(async () => ({ items: [], total: 0 })),
	getUnreadCount: vi.fn(async () => 3),
	markAnnouncementRead: vi.fn(async () => {}),
}));

vi.mock("@gospeak/components", () => ({
	toast: { info: vi.fn(), error: vi.fn() },
}));

// notificationStore 模块加载时自注册 socket / 登出订阅，mock 掉避免拉起整条连接链
vi.mock("@/stores/socketStore", () => ({
	setAnnouncementHandler: vi.fn(),
	socketStore: { onConnected: vi.fn(() => () => {}) },
}));

vi.mock("@/stores/userStore", () => ({
	useUserStore: { subscribe: vi.fn(() => () => {}) },
}));

import { toast } from "@gospeak/components";
import { getUnreadCount, markAnnouncementRead } from "@/api/announcement";
import { notificationStore, useNotificationStore } from "./notificationStore";

const dto = (uuid: string, isRead = false) => ({
	uuid,
	scope_type: "platform" as const,
	title: `t-${uuid}`,
	content: "body",
	level: "info" as const,
	pinned: false,
	created_by_name: "admin",
	is_read: isRead,
	created_at: Date.now(),
});

describe("notificationStore", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(markAnnouncementRead).mockReset();
		vi.mocked(markAnnouncementRead).mockImplementation(async () => {});
		useNotificationStore.setState({
			unreadCount: 0,
			items: [],
			loading: false,
			modalOpen: false,
		});
	});

	it("loads unread count", async () => {
		await notificationStore.loadUnreadCount();
		expect(useNotificationStore.getState().unreadCount).toBe(3);
		expect(getUnreadCount).toHaveBeenCalled();
	});

	it("increments on incoming and prepends", () => {
		notificationStore.handleIncoming(dto("a"));
		const state = useNotificationStore.getState();
		expect(state.unreadCount).toBe(1);
		expect(state.items[0].uuid).toBe("a");
	});

	it("does not double count the same uuid", () => {
		notificationStore.handleIncoming(dto("a"));
		notificationStore.handleIncoming(dto("a"));
		expect(useNotificationStore.getState().unreadCount).toBe(1);
	});

	it("optimistically marks read and calls the API", async () => {
		useNotificationStore.setState({
			unreadCount: 1,
			items: [dto("a")],
			loading: false,
		});
		await notificationStore.markRead("a");
		const state = useNotificationStore.getState();
		expect(state.unreadCount).toBe(0);
		expect(state.items[0].is_read).toBe(true);
		expect(markAnnouncementRead).toHaveBeenCalledWith("a");
	});

	it("rolls back when the API fails", async () => {
		vi.mocked(markAnnouncementRead).mockRejectedValueOnce(new Error("boom"));
		useNotificationStore.setState({
			unreadCount: 1,
			items: [dto("a")],
			loading: false,
		});
		await notificationStore.markRead("a");
		const state = useNotificationStore.getState();
		expect(state.unreadCount).toBe(1);
		expect(state.items[0].is_read).toBe(false);
	});

	it("ignores markRead for an already read item", async () => {
		useNotificationStore.setState({
			unreadCount: 0,
			items: [dto("a", true)],
			loading: false,
		});
		await notificationStore.markRead("a");
		expect(markAnnouncementRead).not.toHaveBeenCalled();
	});

	it("opens and closes the notification modal", () => {
		notificationStore.openModal();
		expect(useNotificationStore.getState().modalOpen).toBe(true);
		notificationStore.closeModal();
		expect(useNotificationStore.getState().modalOpen).toBe(false);
	});

	describe("markAllRead", () => {
		it("marks all unread items read and zeroes the count on full success", async () => {
			useNotificationStore.setState({
				unreadCount: 2,
				items: [dto("a"), dto("b", true), dto("c")],
				loading: false,
			});

			await notificationStore.markAllRead();

			const state = useNotificationStore.getState();
			expect(state.items.every((item) => item.is_read)).toBe(true);
			expect(state.unreadCount).toBe(0);
			expect(markAnnouncementRead).toHaveBeenCalledTimes(2);
			expect(markAnnouncementRead).toHaveBeenCalledWith("a");
			expect(markAnnouncementRead).toHaveBeenCalledWith("c");
			expect(markAnnouncementRead).not.toHaveBeenCalledWith("b");
			expect(toast.error).not.toHaveBeenCalled();
		});

		it("restores failed items and recomputes the count on partial failure", async () => {
			vi.mocked(markAnnouncementRead).mockImplementation(async (uuid) => {
				if (uuid === "b") throw new Error("boom");
			});
			useNotificationStore.setState({
				unreadCount: 3,
				items: [dto("a"), dto("b"), dto("c")],
				loading: false,
			});

			await notificationStore.markAllRead();

			const state = useNotificationStore.getState();
			expect(state.items.find((item) => item.uuid === "a")?.is_read).toBe(true);
			expect(state.items.find((item) => item.uuid === "b")?.is_read).toBe(
				false,
			);
			expect(state.items.find((item) => item.uuid === "c")?.is_read).toBe(true);
			expect(state.unreadCount).toBe(1);
			expect(toast.error).toHaveBeenCalledTimes(1);
		});

		it("is a no-op when nothing is unread", async () => {
			useNotificationStore.setState({
				unreadCount: 0,
				items: [dto("a", true), dto("b", true)],
				loading: false,
			});

			await notificationStore.markAllRead();

			expect(markAnnouncementRead).not.toHaveBeenCalled();
			expect(useNotificationStore.getState().unreadCount).toBe(0);
			expect(toast.error).not.toHaveBeenCalled();
		});
	});

	it("keeps the unread count correct when marking several items concurrently", async () => {
		useNotificationStore.setState({
			unreadCount: 3,
			items: [dto("a"), dto("b"), dto("c")],
			loading: false,
		});

		await Promise.all([
			notificationStore.markRead("a"),
			notificationStore.markRead("b"),
			notificationStore.markRead("c"),
		]);

		const state = useNotificationStore.getState();
		expect(state.unreadCount).toBe(0);
		expect(state.items.every((item) => item.is_read)).toBe(true);
	});

	it("only reverts the failed item when concurrent marks interleave", async () => {
		vi.mocked(markAnnouncementRead).mockImplementation(async (uuid) => {
			if (uuid === "a") throw new Error("boom");
		});
		useNotificationStore.setState({
			unreadCount: 2,
			items: [dto("a"), dto("b")],
			loading: false,
		});

		await Promise.all([
			notificationStore.markRead("a"),
			notificationStore.markRead("b"),
		]);

		const state = useNotificationStore.getState();
		expect(state.unreadCount).toBe(1);
		expect(state.items.find((item) => item.uuid === "a")?.is_read).toBe(false);
		expect(state.items.find((item) => item.uuid === "b")?.is_read).toBe(true);
		expect(toast.error).toHaveBeenCalledTimes(1);
	});
});
