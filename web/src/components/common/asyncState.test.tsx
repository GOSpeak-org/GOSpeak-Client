import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AsyncState from "./AsyncState";

afterEach(cleanup);

describe("AsyncState", () => {
	it("loading 且提供 skeleton 时渲染骨架而不是 spinner", () => {
		const { getByTestId, container } = render(
			<AsyncState
				loading
				loadingText="正在加载消息…"
				skeleton={<div data-testid="sk">骨架</div>}
			>
				<div>内容</div>
			</AsyncState>,
		);
		expect(getByTestId("sk").textContent).toBe("骨架");
		expect(container.querySelector(".animate-spin")).toBeNull();
	});

	it("loading 且无 skeleton 时保留 spinner + loadingText", () => {
		const { container, getByText } = render(
			<AsyncState loading loadingText="正在加载…" />,
		);
		expect(getByText("正在加载…").textContent).toBe("正在加载…");
		const spinner = container.querySelector(".animate-spin");
		expect(spinner).not.toBeNull();
		expect(spinner?.getAttribute("class")).toContain("size-4");
		expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
	});

	it("error 态渲染 role=alert 与重试按钮，不渲染 spinner", () => {
		const { container, getByRole, getByText } = render(
			<AsyncState error="加载失败" onRetry={() => {}} retryText="再试一次" />,
		);
		expect(getByRole("alert").textContent).toContain("加载失败");
		expect(getByText("加载失败").textContent).toBe("加载失败");
		expect(getByText("再试一次").textContent).toBe("再试一次");
		expect(container.querySelector(".animate-spin")).toBeNull();
	});

	it("empty 态渲染空文案而不是 spinner", () => {
		const { container, getByText } = render(
			<AsyncState empty emptyText="还没有消息" />,
		);
		expect(getByText("还没有消息").textContent).toBe("还没有消息");
		expect(container.querySelector(".animate-spin")).toBeNull();
	});

	it("非 loading/error/empty 时渲染 children", () => {
		const { getByText } = render(
			<AsyncState>
				<div>内容</div>
			</AsyncState>,
		);
		expect(getByText("内容").textContent).toBe("内容");
	});
});
