import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_BUILD } from "../conditional";
import { createPush, normalizePushData } from "./push";

const { listeners, plugin, registerPlugin } = vi.hoisted(() => {
	const listeners = new Map<string, (payload: unknown) => void>();
	const plugin = {
		requestPermissions: vi.fn(async () => ({ receive: "granted" })),
		register: vi.fn(async () => {}),
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
	plugin.requestPermissions.mockReset();
	plugin.requestPermissions.mockImplementation(async () => ({
		receive: "granted",
	}));
	plugin.register.mockReset();
	plugin.register.mockImplementation(async () => {});
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

const waitForSubscriptions = () =>
	vi.waitFor(() => expect(plugin.addListener).toHaveBeenCalledTimes(2));

describe("normalizePushData", () => {
	it("keeps string values", () => {
		expect(normalizePushData({ path: "/invite/d/abc" })).toEqual({
			path: "/invite/d/abc",
		});
	});

	it("returns an empty object for non-objects", () => {
		expect(normalizePushData(null)).toEqual({});
		expect(normalizePushData("x")).toEqual({});
	});
});

describe.skipIf(MOBILE_BUILD)("createPush in web fallback", () => {
	it("resolves register to null without a native runtime", async () => {
		await expect(createPush().register()).resolves.toBeNull();
	});

	it("returns unsubscribe functions", () => {
		const push = createPush();
		expect(typeof push.onToken(() => {})).toBe("function");
		expect(typeof push.onNotificationOpened(() => {})).toBe("function");
	});

	it("does not throw when unsubscribing twice", () => {
		const push = createPush();
		const off = push.onToken(() => {});
		off();
		expect(() => off()).not.toThrow();
	});

	it("never touches the Capacitor plugin", async () => {
		const push = createPush();
		await push.register();
		push.onToken(() => {});
		push.onNotificationOpened(() => {});
		expect(registerPlugin).not.toHaveBeenCalled();
	});
});

describe.runIf(MOBILE_BUILD)("createPush on the native plugin", () => {
	it("requests permissions and registers through PushNotifications", async () => {
		const push = createPush();
		await expect(push.register()).resolves.toBeNull();

		expect(registerPlugin).toHaveBeenCalledWith("PushNotifications");
		expect(plugin.requestPermissions).toHaveBeenCalledTimes(1);
		expect(plugin.register).toHaveBeenCalledTimes(1);
	});

	it("subscribes to the registration and action events", async () => {
		const push = createPush();
		const off = push.onToken(() => {});
		await waitForSubscriptions();

		expect(plugin.addListener.mock.calls.map((call) => call[0]).sort()).toEqual(
			["pushNotificationActionPerformed", "registration"],
		);
		off();
	});

	it("delivers the registration token to subscribers and caches it", async () => {
		const push = createPush();
		const tokens: string[] = [];
		push.onToken((token) => tokens.push(token));

		await waitForSubscriptions();
		listeners.get("registration")?.({ value: "tok-1" });

		expect(tokens).toEqual(["tok-1"]);
		await expect(push.register()).resolves.toBe("tok-1");
	});

	it("replays the cached token to late subscribers", async () => {
		const push = createPush();
		await push.register();
		await waitForSubscriptions();
		listeners.get("registration")?.({ value: "tok-2" });

		const late = vi.fn();
		push.onToken(late);

		expect(late).toHaveBeenCalledWith("tok-2");
	});

	it("ignores registration payloads without a token", async () => {
		const push = createPush();
		const handler = vi.fn();
		push.onToken(handler);

		await waitForSubscriptions();
		listeners.get("registration")?.({});
		listeners.get("registration")?.({ value: "" });
		listeners.get("registration")?.(null);

		expect(handler).not.toHaveBeenCalled();
	});

	it("normalizes the notification payload when opened", async () => {
		const push = createPush();
		const opened = vi.fn();
		push.onNotificationOpened(opened);

		await waitForSubscriptions();
		listeners.get("pushNotificationActionPerformed")?.({
			notification: { data: { path: "/invite/d/ABC", roomId: 7 } },
		});

		expect(opened).toHaveBeenCalledWith({ path: "/invite/d/ABC", roomId: 7 });
	});

	it("passes an empty object when the notification carries no data", async () => {
		const push = createPush();
		const opened = vi.fn();
		push.onNotificationOpened(opened);

		await waitForSubscriptions();
		listeners.get("pushNotificationActionPerformed")?.({ notification: {} });
		listeners.get("pushNotificationActionPerformed")?.(null);

		expect(opened).toHaveBeenNthCalledWith(1, {});
		expect(opened).toHaveBeenNthCalledWith(2, {});
	});

	it("stops delivering after unsubscribe", async () => {
		const push = createPush();
		const tokens = vi.fn();
		const opened = vi.fn();
		const offToken = push.onToken(tokens);
		const offOpened = push.onNotificationOpened(opened);

		await waitForSubscriptions();
		offToken();
		offOpened();
		listeners.get("registration")?.({ value: "tok-3" });
		listeners.get("pushNotificationActionPerformed")?.({
			notification: { data: { path: "/x" } },
		});

		expect(tokens).not.toHaveBeenCalled();
		expect(opened).not.toHaveBeenCalled();
	});

	it("warns and resolves null when the permission request fails", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		plugin.requestPermissions.mockRejectedValueOnce(new Error("denied"));

		const push = createPush();
		await expect(push.register()).resolves.toBeNull();

		expect(warn).toHaveBeenCalledWith(
			"[gospeak/mobile] push registration failed",
			expect.any(Error),
		);
		expect(plugin.register).not.toHaveBeenCalled();
	});

	it("retries registration after a failure", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		plugin.requestPermissions.mockRejectedValueOnce(new Error("denied"));

		const push = createPush();
		await push.register();
		await expect(push.register()).resolves.toBeNull();

		expect(plugin.requestPermissions).toHaveBeenCalledTimes(2);
		expect(plugin.register).toHaveBeenCalledTimes(1);
	});

	it("retries after a denied permission without registering listeners", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		plugin.requestPermissions.mockResolvedValueOnce({ receive: "denied" });

		const push = createPush();
		await expect(push.register()).resolves.toBeNull();

		expect(plugin.addListener).not.toHaveBeenCalled();
		expect(plugin.register).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledWith(
			"[gospeak/mobile] push permission not granted",
			"denied",
		);

		await expect(push.register()).resolves.toBeNull();

		expect(plugin.requestPermissions).toHaveBeenCalledTimes(2);
		expect(plugin.addListener).toHaveBeenCalledTimes(2);
		expect(plugin.register).toHaveBeenCalledTimes(1);
	});
});
