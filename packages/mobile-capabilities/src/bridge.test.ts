import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_BUILD } from "./conditional";
import { getPlugin, listenPlugin, pluginMethod } from "./bridge";

const { listeners, plugin, registerPlugin, remove } = vi.hoisted(() => {
	const listeners = new Map<string, (payload: unknown) => void>();
	const remove = vi.fn(async () => {});
	const plugin = {
		addListener: vi.fn(
			async (event: string, handler: (payload: unknown) => void) => {
				listeners.set(event, handler);
				return { remove };
			},
		),
	};
	return { listeners, plugin, registerPlugin: vi.fn(() => plugin), remove };
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
			return { remove };
		},
	);
	remove.mockClear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("pluginMethod", () => {
	it("joins plugin and method with a dot", () => {
		expect(pluginMethod("AudioSession", "activate")).toBe(
			"AudioSession.activate",
		);
	});

	it("keeps the exact casing of both halves", () => {
		expect(pluginMethod("MediaControl", "setMetadata")).toBe(
			"MediaControl.setMetadata",
		);
	});
});

describe.skipIf(MOBILE_BUILD)("getPlugin / listenPlugin in a web build", () => {
	it("getPlugin rejects without loading Capacitor", async () => {
		await expect(getPlugin("AudioSession")).rejects.toThrow(
			/\[gospeak\/mobile\]/,
		);
		expect(registerPlugin).not.toHaveBeenCalled();
	});

	it("getPlugin names the plugin it refused to load", async () => {
		await expect(getPlugin("PushNotifications")).rejects.toThrow(
			/"PushNotifications"/,
		);
	});

	it("listenPlugin resolves to a no-op unsubscriber", async () => {
		const handler = vi.fn();
		const off = await listenPlugin("App", "appUrlOpen", handler);
		expect(typeof off).toBe("function");
		expect(off()).toBeUndefined();
		expect(registerPlugin).not.toHaveBeenCalled();
		expect(handler).not.toHaveBeenCalled();
	});
});

describe.runIf(MOBILE_BUILD)(
	"getPlugin / listenPlugin in a mobile build",
	() => {
		it("getPlugin registers the named Capacitor plugin", async () => {
			const resolved = await getPlugin<{ addListener: () => void }>(
				"AudioSession",
			);
			expect(registerPlugin).toHaveBeenCalledWith("AudioSession");
			expect(typeof resolved.addListener).toBe("function");
		});

		it("does not adopt the Capacitor proxy as a thenable", async () => {
			// Capacitor 的 registerPlugin 代理把任何未知属性（含 then）都转发到原生，
			// 访问 then 会得到 "ServerConfig.then() is not implemented"。
			// Promise.resolve(proxy) 会 adopt thenable 从而卡住 getPlugin。
			const thenSpy = vi.fn(() => {
				throw new Error("ServerConfig.then() is not implemented");
			});
			const setBaseURL = vi.fn(async () => {});
			const thenableProxy = new Proxy(
				{
					getBaseURL: vi.fn(async () => ({ baseUrl: "https://x" })),
					setBaseURL,
				},
				{
					get(target, prop) {
						if (prop === "then") return thenSpy;
						return Reflect.get(target, prop);
					},
				},
			);
			registerPlugin.mockReturnValueOnce(
				thenableProxy as unknown as typeof plugin,
			);
			const resolved = await getPlugin<{
				getBaseURL: () => Promise<{ baseUrl: string }>;
				setBaseURL: (opts: { url: string }) => Promise<void>;
			}>("ServerConfig");
			expect(thenSpy).not.toHaveBeenCalled();
			expect(await resolved.getBaseURL()).toEqual({ baseUrl: "https://x" });
			await resolved.setBaseURL({ url: "https://y" });
			expect(setBaseURL).toHaveBeenCalledWith({ url: "https://y" });
		});

		it("listenPlugin subscribes and forwards payloads", async () => {
			const handler = vi.fn();
			const off = await listenPlugin("App", "appUrlOpen", handler);

			expect(registerPlugin).toHaveBeenCalledWith("App");
			expect(plugin.addListener).toHaveBeenCalledWith(
				"appUrlOpen",
				expect.any(Function),
			);

			listeners.get("appUrlOpen")?.({ url: "gospeak://invite/d/A" });
			expect(handler).toHaveBeenCalledWith({ url: "gospeak://invite/d/A" });

			off();
			expect(remove).toHaveBeenCalledTimes(1);
		});

		it("listenPlugin returns a no-op when the plugin has no addListener", async () => {
			registerPlugin.mockReturnValueOnce({} as unknown as typeof plugin);
			const handler = vi.fn();
			const off = await listenPlugin("Bare", "event", handler);

			expect(typeof off).toBe("function");
			expect(off()).toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
		});
	},
);
