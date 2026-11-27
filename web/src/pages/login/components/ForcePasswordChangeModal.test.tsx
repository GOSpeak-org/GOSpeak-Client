import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ForcePasswordChangeModal from "./ForcePasswordChangeModal";

describe("ForcePasswordChangeModal", () => {
	afterEach(() => {
		cleanup();
	});

	it("提供跳过按钮时，点击直接触发 onSkip", async () => {
		const onSkip = vi.fn();
		render(
			<ForcePasswordChangeModal
				open
				onClose={() => {}}
				onSkip={onSkip}
				onSubmit={async () => {}}
			/>,
		);

		await userEvent.click(
			screen.getByRole("button", { name: "跳过，暂不修改" }),
		);
		expect(onSkip).toHaveBeenCalledTimes(1);
	});

	it("未提供 onSkip 时不渲染跳过按钮", () => {
		render(
			<ForcePasswordChangeModal
				open
				onClose={() => {}}
				onSubmit={async () => {}}
			/>,
		);

		expect(screen.queryByRole("button", { name: "跳过，暂不修改" })).toBeNull();
	});
});
