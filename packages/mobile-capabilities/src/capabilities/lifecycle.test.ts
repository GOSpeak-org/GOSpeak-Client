import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_BUILD } from "../conditional";
import { createLifecycle, isAppState } from "./lifecycle";

const { listeners, plugin, registerPlugin } = vi.hoisted(() => {
	const listeners = new Map<string, (payload: unknown) => void>();
	const plugin = {
		addListener: vi.fn(
			async (event: string, handler: (payload: unknown) => void) => {
				listeners.set(event, handler);
				return { remove: async () => {} };
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
	plugin.addListener.mockImplementation(
		async (event: string, handler: (payload: unknown) => void) => {
			listeners.set(event, handler);
			return { remove: async () => {} };
		},
	);
});

afterEach(() => {
	vi.restoreAllMocks();
});

const waitForStateListener = () =>
	vi.waitFor(() => expect(plugin.addListener).toHaveBeenCalledTimes(1));

describe("isAppState", () => {
	it("accepts active and background", () => {
		expect(isAppState("active")).toBe(true);
		expect(isAppState("background")).toBe(true);
	});

	it("rejects unknown states", () => {
		expect(isAppState("suspended")).toBe(false);
		expect(isAppState(1)).toBe(false);
	});
});

describe.skipIf(MOBILE_BUILD)("createLifecycle in web fallback", () => {
	it("returns an unsubscribe function", () => {
		const off = createLifecycle().onStateChange(() => {});
		expect(typeof off).toBe("function");
	});

	it("does not invoke handlers in fallback", () => {
		const handler = vi.fn();
		createLifecycle().onStateChange(handler);
		expect(handler).not.toHaveBeenCalled();
	});

	it("allows double unsubscribe", () => {
		const off = createLifecycle().onStateChange(() => {});
		off();
		expect(() => off()).not.toThrow();
	});

	it("never touches the Capacitor plugin", () => {
		createLifecycle().onStateChange(() => {});
		expect(registerPlugin).not.toHaveBeenCalled();
		expect(plugin.addListener).not.toHaveBeenCalled();
	});
});

describe.runIf(MOBILE_BUILD)("createLifecycle on the native plugin", () => {
	it("maps a native active state", async () => {
		const seen: string[] = [];
		createLifecycle().onStateChange((state) => seen.push(state));

		await waitForStateListener();
		expect(plugin.addListener.mock.calls[0]?.[0]).toBe("appStateChange");
		listeners.get("appStateChange")?.({ isActive: true });

		expect(seen).toEqual(["active"]);
		expect(registerPlugin).toHaveBeenCalledWith("App");
	});

	it("maps a native background state", async () => {
		const seen: string[] = [];
		createLifecycle().onStateChange((state) => seen.push(state));

		await waitForStateListener();
		listeners.get("appStateChange")?.({ isActive: false });

		expect(seen).toEqual(["background"]);
	});

	it("subscribes to appStateChange only once", async () => {
		const lifecycle = createLifecycle();
		lifecycle.onStateChange(() => {});
		lifecycle.onStateChange(() => {});

		await waitForStateListener();
		expect(plugin.addListener).toHaveBeenCalledTimes(1);
	});

	it("dispatches state changes to every handler", async () => {
		const seen: string[] = [];
		const lifecycle = createLifecycle();
		lifecycle.onStateChange((state) => seen.push(state));
		lifecycle.onStateChange((state) => seen.push(`second:${state}`));

		await waitForStateListener();
		listeners.get("appStateChange")?.({ isActive: true });

		expect(seen).toEqual(["active", "second:active"]);
	});

	it("stops delivering after unsubscribe", async () => {
		const handler = vi.fn();
		const off = createLifecycle().onStateChange(handler);

		await waitForStateListener();
		off();
		listeners.get("appStateChange")?.({ isActive: false });

		expect(handler).not.toHaveBeenCalled();
	});

	it("warns and retries when the listener cannot be attached", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		plugin.addListener.mockRejectedValueOnce(new Error("UNIMPLEMENTED"));

		const lifecycle = createLifecycle();
		lifecycle.onStateChange(() => {});

		await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
		expect(warn).toHaveBeenCalledWith(
			"[gospeak/mobile] appStateChange listener failed",
			expect.any(Error),
		);

		lifecycle.onStateChange(() => {});
		await vi.waitFor(() => expect(plugin.addListener).toHaveBeenCalledTimes(2));
	});
});
