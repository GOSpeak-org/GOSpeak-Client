import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_BUILD } from "../conditional";
import { createKeyboard } from "./keyboard";

const { listeners, plugin, registerPlugin } = vi.hoisted(() => {
	const listeners = new Map<string, (payload?: unknown) => void>();
	const plugin = {
		hide: vi.fn(async () => {}),
		addListener: vi.fn(
			async (event: string, handler: (payload?: unknown) => void) => {
				listeners.set(event, handler);
				return { remove: vi.fn(async () => {}) };
			},
		),
	};
	return { listeners, plugin, registerPlugin: vi.fn(() => plugin) };
});

vi.mock("@capacitor/core", () => ({ registerPlugin }));

beforeEach(() => {
	listeners.clear();
	registerPlugin.mockClear();
	registerPlugin.mockImplementation(() => plugin);
	plugin.addListener.mockClear();
	plugin.hide.mockReset();
	plugin.hide.mockImplementation(async () => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe.skipIf(MOBILE_BUILD)("createKeyboard in web fallback", () => {
	it("returns unsubscribe functions without touching the plugin", () => {
		const keyboard = createKeyboard();
		expect(typeof keyboard.onShow(() => {})).toBe("function");
		expect(typeof keyboard.onHide(() => {})).toBe("function");
		expect(registerPlugin).not.toHaveBeenCalled();
	});

	it("resolves hide without a native runtime", async () => {
		await expect(createKeyboard().hide()).resolves.toBeUndefined();
	});

	it("never invokes handlers in the fallback", () => {
		const onShow = vi.fn();
		const onHide = vi.fn();
		const keyboard = createKeyboard();
		keyboard.onShow(onShow);
		keyboard.onHide(onHide);
		expect(onShow).not.toHaveBeenCalled();
		expect(onHide).not.toHaveBeenCalled();
	});
});

describe.runIf(MOBILE_BUILD)("createKeyboard on the native plugin", () => {
	it("subscribes to both keyboard events once", async () => {
		const keyboard = createKeyboard();
		keyboard.onShow(() => {});
		keyboard.onHide(() => {});
		keyboard.onShow(() => {});

		await vi.waitFor(() => expect(plugin.addListener).toHaveBeenCalledTimes(2));
		expect(plugin.addListener).toHaveBeenCalledWith(
			"keyboardWillShow",
			expect.any(Function),
		);
		expect(plugin.addListener).toHaveBeenCalledWith(
			"keyboardWillHide",
			expect.any(Function),
		);
	});

	it("forwards keyboard height to show handlers", async () => {
		const onShow = vi.fn();
		createKeyboard().onShow(onShow);

		await vi.waitFor(() =>
			expect(listeners.has("keyboardWillShow")).toBe(true),
		);
		listeners.get("keyboardWillShow")?.({ keyboardHeight: 336 });

		expect(onShow).toHaveBeenCalledWith({ keyboardHeight: 336 });
	});

	it("notifies hide handlers", async () => {
		const onHide = vi.fn();
		createKeyboard().onHide(onHide);

		await vi.waitFor(() =>
			expect(listeners.has("keyboardWillHide")).toBe(true),
		);
		listeners.get("keyboardWillHide")?.();

		expect(onHide).toHaveBeenCalledTimes(1);
	});

	it("stops notifying after unsubscribe", async () => {
		const onShow = vi.fn();
		const off = createKeyboard().onShow(onShow);

		await vi.waitFor(() =>
			expect(listeners.has("keyboardWillShow")).toBe(true),
		);
		off();
		listeners.get("keyboardWillShow")?.({ keyboardHeight: 200 });

		expect(onShow).not.toHaveBeenCalled();
	});

	it("hides through the Keyboard plugin", async () => {
		await createKeyboard().hide();

		expect(registerPlugin).toHaveBeenCalledWith("Keyboard");
		expect(plugin.hide).toHaveBeenCalledTimes(1);
	});

	it("warns and resolves when hide fails", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		plugin.hide.mockRejectedValueOnce(new Error("UNIMPLEMENTED"));

		await expect(createKeyboard().hide()).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalledWith(
			"[gospeak/mobile] Keyboard.hide failed",
			expect.any(Error),
		);
	});
});
