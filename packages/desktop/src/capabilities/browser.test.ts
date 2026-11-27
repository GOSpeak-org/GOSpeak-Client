import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowser } from "./browser";

afterEach(() => {
	delete (globalThis as unknown as { window?: unknown }).window;
});

describe("createBrowser 浏览器降级", () => {
	it("调用 window.open 在新标签打开外链", async () => {
		const open = vi.fn();
		(globalThis as unknown as { window: unknown }).window = { open };
		await createBrowser().openExternal("https://example.com");
		expect(open).toHaveBeenCalledWith(
			"https://example.com",
			"_blank",
			"noopener,noreferrer",
		);
	});

	it("window 不存在时不抛异常", async () => {
		await expect(
			createBrowser().openExternal("https://example.com"),
		).resolves.toBeUndefined();
	});
});
