import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMobileBackButton } from "./useMobileBackButton";

const m = vi.hoisted(() => ({
	onBack: vi.fn((_handler: () => void) => () => {}),
	minimize: vi.fn(async () => {}),
	canGoBack: vi.fn(() => false),
	back: vi.fn(() => {}),
}));

vi.mock("@gospeak/mobile-capabilities", () => ({
	inMobile: () => true,
	createBackButton: () => ({ onBack: m.onBack, minimize: m.minimize }),
}));

vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ history: { canGoBack: m.canGoBack, back: m.back } }),
}));

describe("useMobileBackButton", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		m.onBack.mockImplementation(() => () => {});
		m.canGoBack.mockReturnValue(false);
	});

	it("subscribes to the hardware back button", () => {
		renderHook(() => useMobileBackButton());
		expect(m.onBack).toHaveBeenCalledTimes(1);
	});

	it("navigates back when history is available", () => {
		m.canGoBack.mockReturnValue(true);
		renderHook(() => useMobileBackButton());

		const handler = m.onBack.mock.calls[0]?.[0] as () => void;
		act(() => handler());

		expect(m.back).toHaveBeenCalledTimes(1);
		expect(m.minimize).not.toHaveBeenCalled();
	});

	it("minimizes instead of exiting at the root route", () => {
		m.canGoBack.mockReturnValue(false);
		renderHook(() => useMobileBackButton());

		const handler = m.onBack.mock.calls[0]?.[0] as () => void;
		act(() => handler());

		expect(m.minimize).toHaveBeenCalledTimes(1);
		expect(m.back).not.toHaveBeenCalled();
	});
});
