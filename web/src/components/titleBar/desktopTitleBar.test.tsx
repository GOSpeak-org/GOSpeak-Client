import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThemeStore } from "@/stores/themeStore";

const setAppearance = vi.fn(() => Promise.resolve());

vi.mock("@tanstack/react-router", () => ({
	useMatches: () => [{ staticData: { title: "域管理" } }],
	useLocation: () => ({ pathname: "/manage/domains" }),
}));

vi.mock("@gospeak/desktop", () => ({
	createDesktop: () => ({ window: { setAppearance } }),
}));

vi.mock("@/layouts/common/connectionIndicator", () => ({
	default: () => <span data-testid="connection" />,
}));

import DesktopTitleBar from "./desktopTitleBar";

describe("DesktopTitleBar / 桌面构建", () => {
	beforeEach(() => {
		cleanup();
		setAppearance.mockClear();
		useThemeStore.setState({ isDark: false });
		vi.stubGlobal("__GOSPEAK_DESKTOP__", true);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("渲染窗口标题栏与路由标题", () => {
		const { container } = render(<DesktopTitleBar />);
		expect(container.querySelector(".app-titlebar")).not.toBeNull();
		expect(screen.getByText("域管理").textContent).toBe("域管理");
		expect(screen.getByRole("button", { name: "切换到深色" })).not.toBeNull();
	});

	it("把应用主题推给原生外观，主题切换后重推", async () => {
		render(<DesktopTitleBar />);
		expect(setAppearance).toHaveBeenCalledTimes(1);
		expect(setAppearance).toHaveBeenCalledWith("light");

		await act(async () => {
			useThemeStore.setState({ isDark: true });
		});

		expect(setAppearance).toHaveBeenCalledTimes(2);
		expect(setAppearance).toHaveBeenLastCalledWith("dark");
	});
});

describe("DesktopTitleBar / Web 构建", () => {
	beforeEach(() => {
		cleanup();
		setAppearance.mockClear();
		useThemeStore.setState({ isDark: false });
		vi.stubGlobal("__GOSPEAK_DESKTOP__", false);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("不渲染任何节点，也不触碰原生外观", () => {
		const { container } = render(<DesktopTitleBar />);
		expect(container.firstElementChild).toBeNull();
		expect(screen.queryByText("域管理")).toBeNull();
		expect(setAppearance).not.toHaveBeenCalled();
	});
});
