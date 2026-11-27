import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./tab_item", () => ({
	TABS: [
		{ id: "audio", label: "音频", icon: "mic", component: () => null },
		{ id: "about", label: "关于", icon: "info", component: () => null },
	],
}));

import SettingModal from "./settingModal";
import { Page } from "./tab_item/shared";

afterEach(cleanup);

describe("SettingModal 响应式布局", () => {
	it("按容器宽度切换侧栏与横向 tab，而不是视口断点", () => {
		render(<SettingModal open onClose={() => {}} />);
		const dialog = screen.getByRole("dialog");
		expect(dialog.className).toContain("@container");

		const aside = dialog.querySelector("aside");
		expect(aside).not.toBeNull();
		const cls = aside?.className ?? "";
		expect(cls).toContain("overflow-x-auto");
		expect(cls).toContain("@3xl:flex-col");
		expect(cls).toContain("@3xl:w-44");
		expect(cls).toContain("@5xl:w-48");
	});

	it("标题区不重复展示 tab 摘要", () => {
		render(<SettingModal open onClose={() => {}} />);
		const dialog = screen.getByRole("dialog");
		const summary = Array.from(dialog.querySelectorAll("div")).find(
			(el) => el.textContent === "音频、关于",
		);
		expect(summary).toBeFalsy();
	});

	it("内容区标记为容器，供内部栅格按宽度自适应", () => {
		render(<SettingModal open onClose={() => {}} />);
		const dialog = screen.getByRole("dialog");
		// 内容区紧跟在 tab 栏之后；不要用 .bg-card 选，选中态按钮也带 bg-card。
		const content = dialog.querySelector("aside")
			?.nextElementSibling as HTMLElement | null;
		expect(content).not.toBeNull();
		expect(content?.className).toContain("@container");
		expect(content?.className).toContain("overflow-auto");
	});
});

describe("SettingModal tab 状态", () => {
	it("initialTabId 变化时同步到指定 tab", () => {
		const { rerender } = render(
			<SettingModal open onClose={() => {}} initialTabId="audio" />,
		);
		const dialog = screen.getByRole("dialog");
		const aboutBtn = Array.from(dialog.querySelectorAll("button")).find(
			(b) => b.textContent === "关于",
		);
		expect(aboutBtn?.className).not.toContain("bg-card");

		rerender(<SettingModal open onClose={() => {}} initialTabId="about" />);
		expect(aboutBtn?.className).toContain("bg-card");
	});
});

describe("设置页 Page 容器", () => {
	it("内容撑满内容区，不做额外限宽", () => {
		const { container } = render(
			<Page title="关于">
				<p>body</p>
			</Page>,
		);
		const page = container.firstElementChild as HTMLElement;
		expect(page.className).toContain("p-5");
		expect(page.className).toContain("sm:p-6");
		expect(page.className).not.toContain("max-w-3xl");
		expect(page.className).not.toContain("mx-auto");
	});
});
