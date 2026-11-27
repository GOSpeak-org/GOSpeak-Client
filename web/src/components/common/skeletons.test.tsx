import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	AppLoadingSpinner,
	LoadingRegion,
	SkeletonCardGrid,
	SkeletonForm,
	SkeletonIconRail,
	SkeletonListRows,
	SkeletonNotificationDetail,
	SkeletonNotificationList,
	SkeletonPage,
	SkeletonTableRows,
} from "./Skeletons";

afterEach(cleanup);

describe("Skeletons", () => {
	it("LoadingRegion 暴露 status 语义与读屏文案", () => {
		const { getByRole } = render(
			<LoadingRegion label="正在加载用户">
				<SkeletonTableRows rows={2} cols={3} />
			</LoadingRegion>,
		);
		const region = getByRole("status");
		expect(region.getAttribute("aria-busy")).toBe("true");
		expect(region.getAttribute("aria-label")).toBe("正在加载用户");
	});

	it("SkeletonTableRows 按 rows*cols 渲染占位块", () => {
		const { container } = render(
			<LoadingRegion label="加载">
				<SkeletonTableRows rows={3} cols={4} />
			</LoadingRegion>,
		);
		expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(
			12,
		);
	});

	it("SkeletonListRows 每行渲染头像 + 两行文字共 3 块", () => {
		const { container } = render(<SkeletonListRows rows={4} />);
		expect(
			container.querySelectorAll('[data-skeleton="list"] > div'),
		).toHaveLength(4);
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
			12,
		);
	});

	it("SkeletonNotificationList 每行渲染未读圆点 + 标题 + 范围/时间共 4 块", () => {
		const { container } = render(<SkeletonNotificationList rows={4} />);
		const rows = container.querySelectorAll(
			'[data-skeleton="notification-list"] > div',
		);
		expect(rows).toHaveLength(4);
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
			16,
		);
		const dot = rows[0]?.querySelector('[data-slot="skeleton"]');
		expect(dot?.className).toContain("size-1.5");
		expect(dot?.className).toContain("rounded-full");
	});

	it("SkeletonNotificationDetail 渲染标题 + 元信息 + 4 行正文", () => {
		const { container } = render(<SkeletonNotificationDetail />);
		const detail = container.querySelector(
			'[data-skeleton="notification-detail"]',
		);
		expect(detail).not.toBeNull();
		expect(detail?.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6);
	});

	it("SkeletonIconRail 占位块与 OptionSquare 同几何且数量不塌陷", () => {
		const { container } = render(<SkeletonIconRail count={3} />);
		const rail = container.querySelector('[data-skeleton="icon-rail"]');
		expect(rail).not.toBeNull();
		const blocks = rail?.querySelectorAll('[data-slot="skeleton"]') ?? [];
		expect(blocks).toHaveLength(3);
		for (const block of blocks) {
			expect(block.className).toContain("size-12");
			expect(block.className).toContain("rounded-xl");
		}
	});

	it("SkeletonCardGrid 每张卡渲染头像 + 两行文字 + 底部行共 4 块", () => {
		const { container } = render(<SkeletonCardGrid cards={4} />);
		expect(
			container.querySelectorAll('[data-skeleton="card-grid"] > div'),
		).toHaveLength(4);
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
			16,
		);
	});

	it("SkeletonForm 每个字段渲染标签 + 输入框共 2 块", () => {
		const { container } = render(<SkeletonForm fields={3} />);
		expect(
			container.querySelectorAll('[data-skeleton="form"] > div'),
		).toHaveLength(3);
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
			6,
		);
	});

	it("AppLoadingSpinner 以居中转圈暴露 status 语义", () => {
		const { getByRole } = render(<AppLoadingSpinner />);
		const region = getByRole("status");
		expect(region.getAttribute("aria-label")).toBe("正在加载");
		expect(region.querySelector(".animate-spin")).not.toBeNull();
	});

	it("SkeletonPage 保留页面加载骨架的可访问性契约", () => {
		const { getByRole } = render(<SkeletonPage />);
		const region = getByRole("status");
		expect(region.getAttribute("aria-label")).toBe("页面加载中");
		expect(region.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5);
	});
});
