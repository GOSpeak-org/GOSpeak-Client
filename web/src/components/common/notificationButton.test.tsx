import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { state, openModal } = vi.hoisted(() => ({
	state: { unreadCount: 3 },
	openModal: vi.fn(),
}));

vi.mock("@/stores/notificationStore", () => ({
	useNotificationStore: (selector: (s: typeof state) => unknown) =>
		selector(state),
	notificationStore: { openModal },
}));

import NotificationButton from "./notificationButton";

afterEach(() => {
	cleanup();
	openModal.mockClear();
});

describe("NotificationButton", () => {
	it("未读数大于 0 时显示数字徽章，点击打开通知弹窗", async () => {
		state.unreadCount = 3;
		render(<NotificationButton />);

		expect(screen.getByText("3")).toBeTruthy();
		await userEvent.click(screen.getByRole("button", { name: "通知" }));
		expect(openModal).toHaveBeenCalledTimes(1);
	});

	it("未读数为 0 时不渲染徽章", () => {
		state.unreadCount = 0;
		render(<NotificationButton />);

		expect(document.querySelector('[data-slot="badge"]')).toBeNull();
		expect(screen.getByRole("button", { name: "通知" })).toBeTruthy();
	});

	it("未读数超过 99 时徽章显示 99+", () => {
		state.unreadCount = 150;
		render(<NotificationButton />);

		expect(screen.getByText("99+")).toBeTruthy();
	});

	it("入口按钮提供 44px 触摸目标", () => {
		state.unreadCount = 0;
		render(<NotificationButton />);

		const button = screen.getByRole("button", { name: "通知" });
		expect(button.className).toContain("after:-inset-y-2.5");
		expect(button.className).not.toContain("size-11");
	});
});
