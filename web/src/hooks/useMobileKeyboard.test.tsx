import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMobileKeyboard } from "./useMobileKeyboard";

const m = vi.hoisted(() => ({
	onShow: vi.fn((_handler: () => void) => () => {}),
	onHide: vi.fn((_handler: () => void) => () => {}),
	hide: vi.fn(async () => {}),
}));

vi.mock("@gospeak/mobile-capabilities", () => ({
	inMobile: () => true,
	createKeyboard: () => ({
		onShow: m.onShow,
		onHide: m.onHide,
		hide: m.hide,
	}),
}));

describe("useMobileKeyboard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		m.onShow.mockImplementation(() => () => {});
		Element.prototype.scrollIntoView = vi.fn();
	});

	it("subscribes to keyboard show events", () => {
		renderHook(() => useMobileKeyboard());
		expect(m.onShow).toHaveBeenCalledTimes(1);
	});

	it("scrolls the focused input into view", () => {
		renderHook(() => useMobileKeyboard());
		const input = document.createElement("input");
		document.body.appendChild(input);
		input.focus();

		const handler = m.onShow.mock.calls[0]?.[0] as () => void;
		act(() => handler());

		expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
		input.remove();
	});

	it("ignores non-editable focus targets", () => {
		renderHook(() => useMobileKeyboard());
		const button = document.createElement("button");
		document.body.appendChild(button);
		button.focus();

		const handler = m.onShow.mock.calls[0]?.[0] as () => void;
		act(() => handler());

		expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
		button.remove();
	});
});
