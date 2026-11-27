import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Header from "./header";

vi.mock("@/components/titleBar/useRouteTitle", () => ({
	useRouteTitle: () => "首页",
}));
vi.mock("./connectionIndicator", () => ({
	default: () => <span data-testid="connection" />,
}));

afterEach(cleanup);

describe("Header / Web 顶栏品牌", () => {
	it("左上角显示 GOSpeak 字标与图标", () => {
		render(<Header />);

		const brand = screen.getByAltText("GOSpeak");
		expect(brand.getAttribute("src")).toBe("/favicon-256.png");
		expect(brand.nextElementSibling?.textContent).toBe("GOSpeak");
	});

	it("通知按钮位于主题切换左侧", () => {
		render(<Header />);

		const notification = screen.getByRole("button", { name: "通知" });
		const theme = screen.getByRole("button", { name: "切换到深色" });
		expect(
			theme.compareDocumentPosition(notification) &
				Node.DOCUMENT_POSITION_PRECEDING,
		).toBeTruthy();
	});
});
