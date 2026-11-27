import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_BUILD } from "../conditional";
import { createAudioRoute, isAudioRouteKind } from "./audio-route";
import type { AudioRouteKind } from "./audio-route";

const { plugin, registerPlugin } = vi.hoisted(() => {
	const plugin = {
		list: vi.fn(async () => ({
			routes: [] as { kind: string; label: string }[],
		})),
		current: vi.fn(async () => ({ kind: "speaker" })),
		set: vi.fn(async () => {}),
	};
	return { plugin, registerPlugin: vi.fn(() => plugin) };
});

vi.mock("@capacitor/core", () => ({ registerPlugin }));

const EMPTY_ROUTES = { routes: [] as { kind: string; label: string }[] };

beforeEach(() => {
	registerPlugin.mockClear();
	registerPlugin.mockImplementation(() => plugin);
	plugin.list.mockReset();
	plugin.list.mockImplementation(async () => EMPTY_ROUTES);
	plugin.current.mockReset();
	plugin.current.mockImplementation(async () => ({ kind: "speaker" }));
	plugin.set.mockReset();
	plugin.set.mockImplementation(async () => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("isAudioRouteKind", () => {
	it("accepts known routes", () => {
		expect(isAudioRouteKind("speaker")).toBe(true);
		expect(isAudioRouteKind("bluetooth")).toBe(true);
	});

	it("rejects unknown values", () => {
		expect(isAudioRouteKind("airplay")).toBe(false);
		expect(isAudioRouteKind(undefined)).toBe(false);
	});
});

describe.skipIf(MOBILE_BUILD)("createAudioRoute in web fallback", () => {
	it("defaults to speaker", () => {
		expect(createAudioRoute().current()).toBe("speaker");
	});

	it("returns the default option list", async () => {
		const options = await createAudioRoute().list();
		expect(options.map((o) => o.kind)).toEqual(["speaker", "earpiece"]);
	});

	it("ignores set for an unsupported route", async () => {
		const route = createAudioRoute();
		await route.set("bluetooth");
		expect(route.current()).toBe("speaker");
	});

	it("never throws on set", async () => {
		await expect(createAudioRoute().set("earpiece")).resolves.toBeUndefined();
	});

	it("never touches the Capacitor plugin", async () => {
		const route = createAudioRoute();
		await route.list();
		await route.set("earpiece");
		expect(registerPlugin).not.toHaveBeenCalled();
	});

	it("resolves refresh without touching the plugin in fallback", async () => {
		const route = createAudioRoute();
		await expect(route.refresh()).resolves.toBeUndefined();
		expect(route.current()).toBe("speaker");
		expect(registerPlugin).not.toHaveBeenCalled();
	});
});

describe.runIf(MOBILE_BUILD)("createAudioRoute on the native plugin", () => {
	it("lists the routes reported by the native plugin", async () => {
		const route = createAudioRoute();
		plugin.list.mockResolvedValueOnce({
			routes: [
				{ kind: "bluetooth", label: "蓝牙" },
				{ kind: "airplay", label: "投送" },
			],
		});

		await expect(route.list()).resolves.toEqual([
			{ kind: "bluetooth", label: "蓝牙" },
		]);
		expect(registerPlugin).toHaveBeenCalledWith("AudioSession");
		expect(plugin.list).toHaveBeenCalledTimes(1);
	});

	it("falls back when the plugin reports no usable route", async () => {
		const routes = await createAudioRoute().list();
		expect(routes.map((r) => r.kind)).toEqual(["speaker", "earpiece"]);
	});

	it("falls back and warns when the plugin call fails", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		plugin.list.mockRejectedValueOnce(new Error("UNIMPLEMENTED"));

		const routes = await createAudioRoute().list();

		expect(routes.map((r) => r.kind)).toEqual(["speaker", "earpiece"]);
		expect(warn).toHaveBeenCalledWith(
			"[gospeak/mobile] AudioSession.list failed",
			expect.any(Error),
		);
	});

	it("forwards set to the native plugin and adopts the reported route", async () => {
		const route = createAudioRoute();
		plugin.current.mockResolvedValueOnce({ kind: "bluetooth" });

		await route.set("bluetooth");

		expect(plugin.set).toHaveBeenCalledWith({ kind: "bluetooth" });
		expect(route.current()).toBe("bluetooth");
	});

	it("keeps the requested route when the plugin reports an unknown one", async () => {
		const route = createAudioRoute();
		plugin.current.mockResolvedValueOnce({ kind: "airplay" });

		await route.set("headset");

		expect(route.current()).toBe("headset");
	});

	it("ignores an unknown route without touching the plugin", async () => {
		const route = createAudioRoute();
		await route.set("airplay" as AudioRouteKind);

		expect(plugin.set).not.toHaveBeenCalled();
		expect(route.current()).toBe("speaker");
	});

	it("swallows a failing set and warns", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		plugin.set.mockRejectedValueOnce(new Error("UNIMPLEMENTED"));

		const route = createAudioRoute();
		await expect(route.set("earpiece")).resolves.toBeUndefined();

		expect(route.current()).toBe("speaker");
		expect(warn).toHaveBeenCalledWith(
			"[gospeak/mobile] AudioSession.set failed",
			expect.any(Error),
		);
	});

	it("refresh 读取原生 current 并更新缓存", async () => {
		const route = createAudioRoute();
		plugin.current.mockResolvedValueOnce({ kind: "bluetooth" });

		expect(route.current()).toBe("speaker");
		await route.refresh();

		expect(plugin.current).toHaveBeenCalledTimes(1);
		expect(route.current()).toBe("bluetooth");
	});

	it("keeps the cached route when refresh reports an unknown kind", async () => {
		const route = createAudioRoute();
		plugin.current.mockResolvedValueOnce({ kind: "earpiece" });
		await route.set("earpiece");
		plugin.current.mockResolvedValueOnce({ kind: "airplay" });

		await route.refresh();

		expect(route.current()).toBe("earpiece");
	});

	it("warns and keeps the cached route when refresh fails", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		plugin.current.mockRejectedValueOnce(new Error("UNIMPLEMENTED"));

		const route = createAudioRoute();
		await expect(route.refresh()).resolves.toBeUndefined();

		expect(route.current()).toBe("speaker");
		expect(warn).toHaveBeenCalledWith(
			"[gospeak/mobile] AudioSession.current failed",
			expect.any(Error),
		);
	});
});
