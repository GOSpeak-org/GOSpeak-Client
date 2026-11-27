import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useThemeStore } from "@/stores/themeStore";
import AppTitleBar from "./appTitleBar";

describe("AppTitleBar", () => {
	beforeEach(() => {
		cleanup();
		useThemeStore.setState({ isDark: false });
	});

	it("渲染字标与标题", () => {
		render(<AppTitleBar title="域管理" />);
		expect(screen.getByText("域管理")).toBeTruthy();
		expect(screen.getByText("Speak")).toBeTruthy();
	});

	it("整条栏是窗口拖拽区，并给系统按钮让位", () => {
		const { container } = render(<AppTitleBar title="聊天" />);
		const bar = container.firstElementChild as HTMLElement;
		expect(bar.className).toContain("[--app-region:drag]");
		expect(bar.className).toContain("app-titlebar");
		// 只有右侧操作区让出拖拽，整条栏仍可拖动窗口
		expect(
			screen
				.getByRole("button", { name: "切换到深色" })
				.closest("[class*='no-drag']"),
		).not.toBeNull();
	});

	it("主题按钮切换深色模式", async () => {
		render(<AppTitleBar title="聊天" />);
		await userEvent.click(screen.getByRole("button", { name: "切换到深色" }));
		expect(useThemeStore.getState().isDark).toBe(true);
	});

	it("通知按钮位于主题切换左侧", () => {
		render(<AppTitleBar title="聊天" />);
		const notification = screen.getByRole("button", { name: "通知" });
		const theme = screen.getByRole("button", { name: "切换到深色" });
		expect(
			theme.compareDocumentPosition(notification) &
				Node.DOCUMENT_POSITION_PRECEDING,
		).toBeTruthy();
	});

	const connection = () => screen.queryByRole("button", { name: /^服务器/ });

	it("未登录时不渲染连接指示", () => {
		render(<AppTitleBar title="登录" />);
		expect(connection()).toBeNull();
	});

	it("已登录时渲染连接指示", () => {
		render(<AppTitleBar title="聊天" showConnection />);
		expect(connection()).not.toBeNull();
	});
});
