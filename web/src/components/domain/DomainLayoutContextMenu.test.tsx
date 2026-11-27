import { closeContextMenu } from "@gospeak/components";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DomainLayoutContextMenu from "./DomainLayoutContextMenu";

Object.defineProperty(globalThis, "ResizeObserver", {
	value: class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
	writable: true,
});

function fakeRect(top: number, right: number): DOMRect {
	return {
		x: right - 100,
		y: top,
		top,
		right,
		bottom: top + 32,
		left: right - 100,
		width: 100,
		height: 32,
		toJSON: () => ({}),
	} as DOMRect;
}

function getAnchor(): HTMLElement {
	const anchors = Array.from(
		document.querySelectorAll<HTMLElement>('div[aria-hidden="true"]'),
	).filter(
		(el) =>
			el.style.position === "fixed" &&
			el.style.width === "0px" &&
			el.style.height === "0px",
	);
	expect(anchors).toHaveLength(1);
	return anchors[0];
}

describe("DomainLayoutContextMenu 顶部对齐", () => {
	afterEach(() => {
		closeContextMenu();
		cleanup();
	});

	it("右键菜单锚点取域按钮顶部，而不是鼠标落点", () => {
		render(
			<DomainLayoutContextMenu
				label="周末开黑"
				groups={[]}
				onMove={vi.fn()}
				onMoveUp={vi.fn()}
				onMoveDown={vi.fn()}
			>
				<button type="button" aria-label="周末开黑">
					周末开黑
				</button>
			</DomainLayoutContextMenu>,
		);
		const button = screen.getByLabelText("周末开黑");
		vi.spyOn(button, "getBoundingClientRect").mockReturnValue(
			fakeRect(137, 420),
		);

		fireEvent.contextMenu(button, { clientX: 999, clientY: 888 });

		const anchor = getAnchor();
		expect(anchor.style.top).toBe("137px");
		expect(anchor.style.left).toBe("426px");
		expect(anchor.style.top).not.toBe("894px");
	});

	it("按钮未命中时用容器矩形，仍与容器顶部对齐", () => {
		const { container } = render(
			<DomainLayoutContextMenu
				label="默认域"
				groups={[]}
				onMove={vi.fn()}
				onMoveUp={vi.fn()}
				onMoveDown={vi.fn()}
			>
				<span data-testid="rail-label">默认域</span>
			</DomainLayoutContextMenu>,
		);
		const containerEl = container.firstElementChild as HTMLElement;
		vi.spyOn(containerEl, "getBoundingClientRect").mockReturnValue(
			fakeRect(64, 180),
		);

		fireEvent.contextMenu(screen.getByTestId("rail-label"), {
			clientX: 12,
			clientY: 700,
		});

		const anchor = getAnchor();
		expect(anchor.style.top).toBe("64px");
		expect(anchor.style.top).not.toBe("706px");
	});
});
