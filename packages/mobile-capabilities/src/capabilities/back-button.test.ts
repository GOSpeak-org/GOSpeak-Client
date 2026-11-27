import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_BUILD } from "../conditional";
import { createBackButton } from "./back-button";

const { listeners, plugin, registerPlugin } = vi.hoisted(() => {
	const listeners = new Map<string, () => void>();
	const plugin = {
		minimizeApp: vi.fn(async () => {}),
		addListener: vi.fn(async (event: string, handler: () => void) => {
			listeners.set(event, handler);
			return { remove: vi.fn(async () => {}) };
		}),
	};
	return { listeners, plugin, registerPlugin: vi.fn(() => plugin) };
});

vi.mock("@capacitor/core", () => ({ registerPlugin }));

beforeEach(() => {
	listeners.clear();
	registerPlugin.mockClear();
	registerPlugin.mockImplementation(() => plugin);
	plugin.addListener.mockClear();
	plugin.minimizeApp.mockReset();
	plugin.minimizeApp.mockImplementation(async () => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe.skipIf(MOBILE_BUILD)("createBackButton in web fallback", () => {
	it("returns an unsubscribe function without touching the plugin", () => {
		const off = createBackButton().onBack(() => {});
		expect(typeof off).toBe("function");
		expect(registerPlugin).not.toHaveBeenCalled();
	});

	it("resolves minimize without a native runtime", async () => {
		await expect(createBackButton().minimize()).resolves.toBeUndefined();
	});

	it("does not fire handlers in the fallback", () => {
		const handler = vi.fn();
		createBackButton().onBack(handler);
		expect(handler).not.toHaveBeenCalled();
	});

	it("allows double unsubscribe", () => {
		const off = createBackButton().onBack(() => {});
		off();
		expect(() => off()).not.toThrow();
	});
});

describe.runIf(MOBILE_BUILD)("createBackButton on the native plugin", () => {
	it("registers a single backButton listener for many handlers", async () => {
		const back = createBackButton();
		back.onBack(() => {});
		back.onBack(() => {});

		await vi.waitFor(() =>
			expect(plugin.addListener).toHaveBeenCalledWith(
				"backButton",
				expect.any(Function),
			),
		);
		expect(plugin.addListener).toHaveBeenCalledTimes(1);
	});

	it("invokes every subscribed handler on a back press", async () => {
		const first = vi.fn();
		const second = vi.fn();
		const back = createBackButton();
		back.onBack(first);
		back.onBack(second);

		await vi.waitFor(() => expect(listeners.has("backButton")).toBe(true));
		listeners.get("backButton")?.();

		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
	});

	it("stops invoking a handler after unsubscribe", async () => {
		const handler = vi.fn();
		const off = createBackButton().onBack(handler);

		await vi.waitFor(() => expect(listeners.has("backButton")).toBe(true));
		off();
		listeners.get("backButton")?.();

		expect(handler).not.toHaveBeenCalled();
	});

	it("minimizes through the App plugin", async () => {
		await createBackButton().minimize();

		expect(registerPlugin).toHaveBeenCalledWith("App");
		expect(plugin.minimizeApp).toHaveBeenCalledTimes(1);
	});

	it("warns and resolves when minimizeApp fails", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		plugin.minimizeApp.mockRejectedValueOnce(new Error("UNIMPLEMENTED"));

		await expect(createBackButton().minimize()).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalledWith(
			"[gospeak/mobile] App.minimizeApp failed",
			expect.any(Error),
		);
	});
});
