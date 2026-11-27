import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LoadingRegion, SkeletonListRows } from "./Skeletons";

afterEach(cleanup);

describe("骨架屏占满容器", () => {
	it("LoadingRegion 默认占满父容器高度", () => {
		const { getByRole } = render(
			<LoadingRegion label="加载中">
				<SkeletonListRows rows={2} />
			</LoadingRegion>,
		);
		const region = getByRole("status");
		expect(region.className).toContain("h-full");
		expect(region.className).toContain("w-full");
	});

	it("调用方可叠加自定义 className 而不丢失占满语义", () => {
		const { getByRole } = render(
			<LoadingRegion label="加载中" className="p-4">
				<div />
			</LoadingRegion>,
		);
		const region = getByRole("status");
		expect(region.className).toContain("h-full");
		expect(region.className).toContain("p-4");
	});
});
