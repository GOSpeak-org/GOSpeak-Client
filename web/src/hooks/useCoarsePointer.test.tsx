import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCoarsePointer } from "./useCoarsePointer";

function stubMatchMedia(matches: boolean) {
	const listeners = new Set<() => void>();
	const mql = {
		matches,
		media: "(hover: none)",
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: (_: string, cb: () => void) => listeners.add(cb),
		removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
		dispatchEvent: () => false,
	} as unknown as MediaQueryList;
	vi.spyOn(window, "matchMedia").mockImplementation(() => mql);
	return { mql, listeners };
}

describe("useCoarsePointer", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("触屏设备（hover: none）返回 true", () => {
		stubMatchMedia(true);
		const { result } = renderHook(() => useCoarsePointer());
		expect(result.current).toBe(true);
	});

	it("鼠标设备返回 false", () => {
		stubMatchMedia(false);
		const { result } = renderHook(() => useCoarsePointer());
		expect(result.current).toBe(false);
	});

	it("输入设备变化时跟随更新", () => {
		const { mql, listeners } = stubMatchMedia(false);
		const { result } = renderHook(() => useCoarsePointer());
		(mql as { matches: boolean }).matches = true;
		act(() => {
			for (const cb of listeners) cb();
		});
		expect(result.current).toBe(true);
	});
});
