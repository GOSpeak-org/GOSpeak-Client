import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OptionSquare from "./optionSquare";

afterEach(() => {
	cleanup();
});

describe("OptionSquare", () => {
	it("tooltip 与按钮垂直居中", () => {
		const rect = {
			top: 120,
			height: 48,
			left: 8,
			right: 56,
		} as DOMRect;
		const rectSpy = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockReturnValue(rect);
		try {
			render(
				<OptionSquare label="测试域">
					<span>测</span>
				</OptionSquare>,
			);
			fireEvent.mouseEnter(screen.getByRole("button", { name: "测试域" }));
			const tooltip = document.querySelector('[aria-hidden="true"]');
			expect(tooltip).not.toBeNull();
			expect((tooltip as HTMLElement).style.top).toBe("144px");
			expect((tooltip as HTMLElement).style.left).toBe("64px");
			expect((tooltip as HTMLElement).style.transform).toBe("translateY(-50%)");
		} finally {
			rectSpy.mockRestore();
		}
	});

	it("activates a double-click-only item with the Enter key", () => {
		const onDoubleClick = vi.fn();
		render(
			<OptionSquare
				label="测试域"
				requiresDoubleClick
				onDoubleClick={onDoubleClick}
			>
				<span>测</span>
			</OptionSquare>,
		);
		fireEvent.keyDown(screen.getByRole("button", { name: "测试域" }), {
			key: "Enter",
		});
		expect(onDoubleClick).toHaveBeenCalledTimes(1);
	});
});
