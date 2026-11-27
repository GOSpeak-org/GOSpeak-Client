import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock 工厂会被提升到 import 之前，因此共享状态必须用 vi.hoisted 创建。
const { state, markRead, markAllRead, loadList } = vi.hoisted(() => ({
	state: {
		items: [] as Array<Record<string, unknown>>,
		loading: false,
		unreadCount: 0,
	},
	markRead: vi.fn(),
	markAllRead: vi.fn(),
	loadList: vi.fn(),
}));

vi.mock("@/stores/notificationStore", () => ({
	useNotificationStore: (selector: (s: typeof state) => unknown) =>
		selector(state),
	notificationStore: { loadList, markRead, markAllRead },
}));

import NotificationModal from "./notificationModal";

function makeItem(overrides: Record<string, unknown> = {}) {
	return {
		uuid: "a-1",
		scope_type: "platform",
		title: "维护公告",
		content: "正文",
		level: "info",
		pinned: false,
		created_by_name: "admin",
		is_read: false,
		created_at: Date.now(),
		...overrides,
	};
}

describe("NotificationModal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.items = [];
		state.loading = false;
		state.unreadCount = 0;
	});

	// Radix Dialog 渲染在 portal 里，不清理会跨用例残留导致 getByText 命中多个。
	afterEach(() => {
		cleanup();
	});

	it("shows the empty state when there are no notifications", () => {
		render(<NotificationModal open onClose={() => {}} />);
		expect(screen.getByText("暂无通知").textContent).toBe("暂无通知");
		expect(screen.getByText("有新公告时会显示在这里")).toBeTruthy();
		expect(screen.getByText("选择一条通知查看详情")).toBeTruthy();
	});

	it("renders skeletons instead of a bare loading label while loading", () => {
		state.loading = true;
		render(<NotificationModal open onClose={() => {}} />);
		const dialog = screen.getByRole("dialog");
		expect(
			dialog.querySelector('[data-skeleton="notification-list"]'),
		).not.toBeNull();
		expect(
			dialog.querySelector('[data-skeleton="notification-detail"]'),
		).not.toBeNull();
		expect(within(dialog).getByLabelText("正在加载通知列表")).toBeTruthy();
		expect(within(dialog).getByLabelText("正在加载通知详情")).toBeTruthy();
		expect(dialog.textContent).not.toContain("加载中");
		expect(screen.queryByText("暂无通知")).toBeNull();
		expect(screen.queryByText("选择一条通知查看详情")).toBeNull();
	});

	it("closes when the close button is clicked", async () => {
		const onClose = vi.fn();
		render(<NotificationModal open onClose={onClose} />);
		await userEvent.click(screen.getByLabelText("关闭"));
		expect(onClose).toHaveBeenCalled();
	});

	it("loads the list when opened", () => {
		render(<NotificationModal open onClose={() => {}} />);
		expect(loadList).toHaveBeenCalled();
	});

	it("marks an item read when selected", async () => {
		state.items = [makeItem({ is_read: false })];
		render(<NotificationModal open onClose={() => {}} />);
		// 列表项与详情标题都会渲染标题文本，这里只点列表里的那个按钮。
		const listButton = screen
			.getAllByText("维护公告")
			.find((el) => el.closest("button") !== null);
		expect(listButton).toBeTruthy();
		await userEvent.click(listButton as HTMLElement);
		expect(markRead).toHaveBeenCalledWith("a-1");
	});

	it("renders markdown content sanitized", () => {
		state.items = [
			makeItem({
				uuid: "a-2",
				title: "安全",
				content: '<img src=x onerror="alert(1)">正文',
				level: "warning",
				is_read: true,
			}),
		];
		render(<NotificationModal open onClose={() => {}} />);
		const dialog = screen.getByRole("dialog");
		expect(dialog.textContent).toContain("正文");
		expect(dialog.textContent).toContain("安全");
		expect(dialog.querySelector("script")).toBeNull();
		expect(dialog.querySelectorAll("img[onerror]")).toHaveLength(0);
		const inlineHandlers = Array.from(dialog.querySelectorAll("*")).flatMap(
			(el) =>
				Array.from(el.attributes)
					.map((attr) => attr.name.toLowerCase())
					.filter((name) => name.startsWith("on")),
		);
		expect(inlineHandlers).toEqual([]);
	});

	it("renders the scope label neutrally instead of using the level color", () => {
		state.items = [
			makeItem({ scope_type: "platform", level: "critical", is_read: true }),
		];
		render(<NotificationModal open onClose={() => {}} />);
		const scopeLabels = screen.getAllByText("全站");
		expect(scopeLabels.length).toBeGreaterThan(0);
		for (const label of scopeLabels) {
			expect(label.className).toContain("text-muted-foreground");
			expect(label.className).not.toContain("text-destructive");
		}
	});

	it("renders each level as a badge with matching label and color", () => {
		const cases = [
			["info", "提示", "text-info"],
			["warning", "警告", "text-warning"],
			["critical", "重要", "text-destructive"],
		] as const;
		for (const [level, label, color] of cases) {
			cleanup();
			state.items = [makeItem({ uuid: level, level, is_read: true })];
			render(<NotificationModal open onClose={() => {}} />);
			const badges = screen.getAllByText(label);
			expect(badges.length).toBeGreaterThan(0);
			for (const badge of badges) {
				expect(badge.className).toContain(color);
			}
		}
	});

	it("shows a pinned marker for pinned notifications", () => {
		state.items = [makeItem({ pinned: true })];
		render(<NotificationModal open onClose={() => {}} />);
		expect(screen.getAllByText("置顶").length).toBeGreaterThan(0);
	});

	it("keeps a balanced width-to-height ratio even with a single notification", () => {
		state.items = [makeItem()];
		render(<NotificationModal open onClose={() => {}} />);
		const cls = screen.getByRole("dialog").className;
		const minH = /min-h-\[min\(\d+dvh,(\d+)px\)\]/.exec(cls);
		const width = /w-\[min\(\d+vw,(\d+)px\)\]/.exec(cls);
		expect(minH).not.toBeNull();
		expect(width).not.toBeNull();
		// 内容很少时也不能塌成宽扁条：最小高度至少 480px，宽度不超过 860px
		expect(Number(minH?.[1])).toBeGreaterThanOrEqual(480);
		expect(Number(width?.[1])).toBeLessThanOrEqual(860);
	});

	it("marks all notifications read from the header action", async () => {
		state.unreadCount = 2;
		state.items = [makeItem({ is_read: false })];
		render(<NotificationModal open onClose={() => {}} />);
		await userEvent.click(screen.getByText("全部已读"));
		expect(markAllRead).toHaveBeenCalled();
	});
});
