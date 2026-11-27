import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_BUILD } from "../conditional";
import { createDeepLink, normalizeDeepLink } from "./deeplink";

const { listeners, plugin, registerPlugin } = vi.hoisted(() => {
	const listeners = new Map<string, (payload: unknown) => void>();
	const plugin = {
		getLaunchUrl: vi.fn(async () => ({ url: "" })),
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
	plugin.getLaunchUrl.mockReset();
	plugin.getLaunchUrl.mockImplementation(async () => ({ url: "" }));
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

const waitForLinkListener = () =>
	vi.waitFor(() => expect(plugin.addListener).toHaveBeenCalledTimes(1));

describe("normalizeDeepLink", () => {
	it("converts the invite scheme to an in-app path", () => {
		expect(normalizeDeepLink("gospeak://invite/d/ABC123")).toBe(
			"/invite/d/ABC123",
		);
	});

	it("keeps an existing in-app path", () => {
		expect(normalizeDeepLink("/invite/d/ABC123")).toBe("/invite/d/ABC123");
	});

	it("rejects foreign schemes", () => {
		expect(normalizeDeepLink("https://evil.example/invite/d/x")).toBeNull();
	});

	it("rejects non-string input", () => {
		expect(normalizeDeepLink(undefined as unknown as string)).toBeNull();
	});
});

describe.skipIf(MOBILE_BUILD)("createDeepLink in web fallback", () => {
	it("returns an unsubscribe function", () => {
		const off = createDeepLink().onLink(() => {});
		expect(typeof off).toBe("function");
	});

	it("resolves the initial link to null", async () => {
		await expect(createDeepLink().initial()).resolves.toBeNull();
	});

	it("never touches the Capacitor plugin", async () => {
		const deepLink = createDeepLink();
		await deepLink.initial();
		deepLink.onLink(() => {});
		expect(registerPlugin).not.toHaveBeenCalled();
	});
});

describe.runIf(MOBILE_BUILD)("createDeepLink on the native plugin", () => {
	it("normalizes the launch url reported by App.getLaunchUrl", async () => {
		plugin.getLaunchUrl.mockResolvedValueOnce({
			url: "gospeak://invite/d/ABC123",
		});

		await expect(createDeepLink().initial()).resolves.toBe("/invite/d/ABC123");
		expect(registerPlugin).toHaveBeenCalledWith("App");
	});

	it("caches the launch url after the first read", async () => {
		const deepLink = createDeepLink();
		plugin.getLaunchUrl.mockResolvedValue({ url: "gospeak://invite/d/CACHED" });

		await expect(deepLink.initial()).resolves.toBe("/invite/d/CACHED");
		await expect(deepLink.initial()).resolves.toBe("/invite/d/CACHED");
		expect(plugin.getLaunchUrl).toHaveBeenCalledTimes(1);
		expect(registerPlugin).toHaveBeenCalledTimes(1);
	});

	it("returns null for a foreign launch url", async () => {
		plugin.getLaunchUrl.mockResolvedValueOnce({
			url: "https://evil.example/invite/d/x",
		});

		await expect(createDeepLink().initial()).resolves.toBeNull();
	});

	it("returns null and warns when getLaunchUrl fails", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		plugin.getLaunchUrl.mockRejectedValueOnce(new Error("UNIMPLEMENTED"));

		await expect(createDeepLink().initial()).resolves.toBeNull();
		expect(warn).toHaveBeenCalledWith(
			"[gospeak/mobile] getLaunchUrl failed",
			expect.any(Error),
		);
	});

	it("subscribes to appUrlOpen only once", async () => {
		const deepLink = createDeepLink();
		deepLink.onLink(() => {});
		deepLink.onLink(() => {});

		await waitForLinkListener();
		expect(plugin.addListener).toHaveBeenCalledTimes(1);
		expect(plugin.addListener.mock.calls[0]?.[0]).toBe("appUrlOpen");
	});

	it("dispatches normalized deep links to every handler", async () => {
		const seen: string[] = [];
		const deepLink = createDeepLink();
		deepLink.onLink((path) => seen.push(path));
		deepLink.onLink((path) => seen.push(`second:${path}`));

		await waitForLinkListener();
		listeners.get("appUrlOpen")?.({ url: "gospeak://invite/d/XYZ" });

		expect(seen).toEqual(["/invite/d/XYZ", "second:/invite/d/XYZ"]);
	});

	it("ignores links outside the app scheme", async () => {
		const handler = vi.fn();
		createDeepLink().onLink(handler);

		await waitForLinkListener();
		listeners.get("appUrlOpen")?.({ url: "https://evil.example/x" });
		listeners.get("appUrlOpen")?.({ url: "" });
		listeners.get("appUrlOpen")?.(null);

		expect(handler).not.toHaveBeenCalled();
	});

	it("stops delivering after unsubscribe", async () => {
		const handler = vi.fn();
		const off = createDeepLink().onLink(handler);

		await waitForLinkListener();
		off();
		listeners.get("appUrlOpen")?.({ url: "gospeak://invite/d/OFF" });

		expect(handler).not.toHaveBeenCalled();
	});

	it("warns when the deep link listener cannot be attached", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		plugin.addListener.mockRejectedValueOnce(new Error("UNIMPLEMENTED"));

		createDeepLink().onLink(() => {});

		await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
		expect(warn).toHaveBeenCalledWith(
			"[gospeak/mobile] deeplink listener failed",
			expect.any(Error),
		);
	});
});
