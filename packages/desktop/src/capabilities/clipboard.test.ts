import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
	desktop: false,
	invoke: vi.fn(),
	warn: vi.fn(),
}));

vi.mock("../runtime", () => ({
	isDesktop: () => mock.desktop,
}));

vi.mock("../bridge", () => ({
	command: (service: string, method: string) => `${service}.${method}`,
	bridge: {
		invoke: (...args: unknown[]) => mock.invoke(...args),
	},
}));

import { createClipboard } from "./clipboard";

const originalNavigator = Object.getOwnPropertyDescriptor(
	globalThis,
	"navigator",
);

function setWebClipboard(api: unknown): void {
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: { clipboard: api },
	});
}

beforeEach(() => {
	mock.desktop = false;
	mock.invoke.mockReset();
	mock.warn.mockReset();
	vi.spyOn(console, "warn").mockImplementation(mock.warn);
});

afterEach(() => {
	vi.restoreAllMocks();
	if (originalNavigator) {
		Object.defineProperty(globalThis, "navigator", originalNavigator);
	} else {
		Reflect.deleteProperty(globalThis, "navigator");
	}
});

describe("createClipboard 浏览器降级", () => {
	it("readText 透传 navigator.clipboard.readText", async () => {
		const readText = vi.fn().mockResolvedValue("invite-code");
		setWebClipboard({ readText, writeText: vi.fn() });

		await expect(createClipboard().readText()).resolves.toBe("invite-code");
		expect(readText).toHaveBeenCalledOnce();
		expect(mock.warn).not.toHaveBeenCalled();
	});

	it("writeText 透传 navigator.clipboard.writeText", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		setWebClipboard({ readText: vi.fn(), writeText });

		await expect(createClipboard().writeText("hello")).resolves.toBeUndefined();
		expect(writeText).toHaveBeenCalledWith("hello");
	});

	it("navigator.clipboard 缺失时明确报错并记录，不静默吞掉", async () => {
		setWebClipboard(undefined);

		await expect(createClipboard().readText()).rejects.toThrow(
			/navigator.clipboard is unavailable/,
		);
		expect(mock.warn).toHaveBeenCalled();
	});

	it("浏览器拒绝读取时原样抛出并记录", async () => {
		const denial = new Error("NotAllowedError");
		setWebClipboard({
			readText: vi.fn().mockRejectedValue(denial),
			writeText: vi.fn(),
		});

		await expect(createClipboard().readText()).rejects.toBe(denial);
		expect(mock.warn).toHaveBeenCalledWith(
			"[gospeak-desktop] clipboard.readText failed:",
			denial,
		);
	});

	it("navigator 不存在时返回 rejected Promise 而非同步抛错", async () => {
		Reflect.deleteProperty(globalThis, "navigator");

		await expect(createClipboard().writeText("x")).rejects.toThrow(
			/navigator is unavailable/,
		);
		expect(mock.warn).toHaveBeenCalled();
	});
});

describe("createClipboard 桌面宿主", () => {
	beforeEach(() => {
		mock.desktop = true;
	});

	it("readText 走 Clipboard.ReadText 绑定，不触碰 navigator.clipboard", async () => {
		const readText = vi.fn();
		setWebClipboard({ readText, writeText: vi.fn() });
		mock.invoke.mockResolvedValue("os-text");

		await expect(createClipboard().readText()).resolves.toBe("os-text");
		expect(mock.invoke).toHaveBeenCalledWith("Clipboard.ReadText");
		expect(readText).not.toHaveBeenCalled();
	});

	it("writeText 走 Clipboard.WriteText 绑定并传递文本", async () => {
		const writeText = vi.fn();
		setWebClipboard({ readText: vi.fn(), writeText });
		mock.invoke.mockResolvedValue(undefined);

		await expect(createClipboard().writeText("hello")).resolves.toBeUndefined();
		expect(mock.invoke).toHaveBeenCalledWith("Clipboard.WriteText", "hello");
		expect(writeText).not.toHaveBeenCalled();
	});
});
