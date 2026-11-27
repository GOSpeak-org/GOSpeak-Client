import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_BUILD } from "../conditional";
import { createMediaControl, isMediaAction } from "./media-control";

const { listeners, plugin, registerPlugin } = vi.hoisted(() => {
	const listeners = new Map<string, (payload: unknown) => void>();
	const plugin = {
		setMetadata: vi.fn(async () => {}),
		clear: vi.fn(async () => {}),
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
	plugin.setMetadata.mockReset();
	plugin.setMetadata.mockImplementation(async () => {});
	plugin.clear.mockReset();
	plugin.clear.mockImplementation(async () => {});
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

const waitForActionListener = () =>
	vi.waitFor(() => expect(plugin.addListener).toHaveBeenCalledTimes(1));

describe("isMediaAction", () => {
	it("accepts known actions", () => {
		expect(isMediaAction("mute")).toBe(true);
		expect(isMediaAction("hangup")).toBe(true);
	});

	it("rejects unknown actions", () => {
		expect(isMediaAction("skip")).toBe(false);
		expect(isMediaAction(null)).toBe(false);
	});
});

describe.skipIf(MOBILE_BUILD)("createMediaControl in web fallback", () => {
	it("resolves setMetadata without native runtime", async () => {
		await expect(
			createMediaControl().setMetadata({ title: "房间", subtitle: "3 人" }),
		).resolves.toBeUndefined();
	});

	it("resolves clear", async () => {
		await expect(createMediaControl().clear()).resolves.toBeUndefined();
	});

	it("returns an unsubscribe function", () => {
		const off = createMediaControl().onAction(() => {});
		expect(typeof off).toBe("function");
		expect(() => off()).not.toThrow();
	});

	it("does not invoke handlers in fallback", () => {
		const handler = vi.fn();
		createMediaControl().onAction(handler);
		expect(handler).not.toHaveBeenCalled();
	});

	it("never touches the Capacitor plugin", async () => {
		const control = createMediaControl();
		await control.setMetadata({ title: "房间" });
		await control.clear();
		control.onAction(() => {});
		expect(registerPlugin).not.toHaveBeenCalled();
		expect(plugin.addListener).not.toHaveBeenCalled();
	});
});

describe.runIf(MOBILE_BUILD)("createMediaControl on the native plugin", () => {
	it("forwards the metadata to MediaControl.setMetadata", async () => {
		const input = { title: "房间", subtitle: "3 人", muted: true };
		await createMediaControl().setMetadata(input);

		expect(registerPlugin).toHaveBeenCalledWith("MediaControl");
		expect(plugin.setMetadata).toHaveBeenCalledWith(input);
	});

	it("forwards clear to the plugin", async () => {
		const control = createMediaControl();
		await control.setMetadata({ title: "房间" });
		await control.clear();

		expect(plugin.clear).toHaveBeenCalledTimes(1);
	});

	it("subscribes to the action event only once", async () => {
		const control = createMediaControl();
		control.onAction(() => {});
		control.onAction(() => {});

		await waitForActionListener();
		expect(plugin.addListener).toHaveBeenCalledTimes(1);
		expect(plugin.addListener.mock.calls[0]?.[0]).toBe("action");
		expect(plugin.addListener.mock.calls[0]?.[1]).toEqual(expect.any(Function));
	});

	it("dispatches native actions to every handler", async () => {
		const seen: string[] = [];
		const control = createMediaControl();
		control.onAction((action) => seen.push(action));
		control.onAction((action) => seen.push(`second:${action}`));

		await waitForActionListener();
		listeners.get("action")?.({ action: "mute" });
		listeners.get("action")?.({ action: "hangup" });

		expect(seen).toEqual(["mute", "second:mute", "hangup", "second:hangup"]);
	});

	it("ignores payloads that are not media actions", async () => {
		const handler = vi.fn();
		createMediaControl().onAction(handler);

		await waitForActionListener();
		listeners.get("action")?.({ action: "skip" });
		listeners.get("action")?.({});
		listeners.get("action")?.(null);

		expect(handler).not.toHaveBeenCalled();
	});

	it("stops delivering after unsubscribe", async () => {
		const handler = vi.fn();
		const off = createMediaControl().onAction(handler);

		await waitForActionListener();
		off();
		listeners.get("action")?.({ action: "unmute" });

		expect(handler).not.toHaveBeenCalled();
	});

	it("swallows a failing setMetadata and warns", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		plugin.setMetadata.mockRejectedValueOnce(new Error("UNIMPLEMENTED"));

		await expect(
			createMediaControl().setMetadata({ title: "房间" }),
		).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalledWith(
			"[gospeak/mobile] MediaControl.setMetadata failed",
			expect.any(Error),
		);
	});

	it("swallows a failing clear and warns", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		plugin.clear.mockRejectedValueOnce(new Error("UNIMPLEMENTED"));

		await expect(createMediaControl().clear()).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalledWith(
			"[gospeak/mobile] MediaControl.clear failed",
			expect.any(Error),
		);
	});
});
