import { renderHook } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuthParallax } from "./useAuthParallax";

describe("useAuthParallax", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("无 hover 环境不启动 rAF", () => {
		vi.spyOn(window, "matchMedia").mockImplementation(
			(query: string) =>
				({
					matches: query === "(hover: none)",
					media: query,
					onchange: null,
					addListener: () => {},
					removeListener: () => {},
					addEventListener: () => {},
					removeEventListener: () => {},
					dispatchEvent: () => false,
				}) as unknown as MediaQueryList,
		);
		const raf = vi.fn(() => 1);
		vi.stubGlobal("requestAnimationFrame", raf);

		renderHook(() => useAuthParallax(createRef<HTMLDivElement>()));

		expect(raf).not.toHaveBeenCalled();
	});
});
