import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_BUILD } from "../conditional";
import { createAudioSession } from "./audio-session";

const { plugin, registerPlugin } = vi.hoisted(() => {
	const plugin = {
		activate: vi.fn(async () => {}),
		deactivate: vi.fn(async () => {}),
	};
	return { plugin, registerPlugin: vi.fn(() => plugin) };
});

vi.mock("@capacitor/core", () => ({ registerPlugin }));

beforeEach(() => {
	registerPlugin.mockClear();
	registerPlugin.mockImplementation(() => plugin);
	plugin.activate.mockReset();
	plugin.activate.mockImplementation(async () => {});
	plugin.deactivate.mockReset();
	plugin.deactivate.mockImplementation(async () => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe.skipIf(MOBILE_BUILD)("createAudioSession in web fallback", () => {
	it("resolves activate without a native runtime", async () => {
		const session = createAudioSession();
		await expect(session.activate()).resolves.toBeUndefined();
	});

	it("resolves deactivate without a native runtime", async () => {
		const session = createAudioSession();
		await expect(session.deactivate()).resolves.toBeUndefined();
	});

	it("reports inactive by default", () => {
		expect(createAudioSession().isActive()).toBe(false);
	});

	it("tracks active state after activate in fallback", async () => {
		const session = createAudioSession();
		await session.activate();
		expect(session.isActive()).toBe(true);
	});

	it("never throws when deactivated twice", async () => {
		const session = createAudioSession();
		await session.activate();
		await session.deactivate();
		await expect(session.deactivate()).resolves.toBeUndefined();
	});

	it("never touches the Capacitor plugin", async () => {
		const session = createAudioSession();
		await session.activate();
		expect(registerPlugin).not.toHaveBeenCalled();
	});
});

describe.runIf(MOBILE_BUILD)("createAudioSession on the native plugin", () => {
	it("activates through the AudioSession plugin", async () => {
		const session = createAudioSession();
		await session.activate();

		expect(registerPlugin).toHaveBeenCalledWith("AudioSession");
		expect(plugin.activate).toHaveBeenCalledTimes(1);
		expect(plugin.activate).toHaveBeenCalledWith();
		expect(plugin.deactivate).not.toHaveBeenCalled();
		expect(session.isActive()).toBe(true);
	});

	it("deactivates through the AudioSession plugin", async () => {
		const session = createAudioSession();
		await session.activate();
		await session.deactivate();

		expect(plugin.deactivate).toHaveBeenCalledTimes(1);
		expect(session.isActive()).toBe(false);
	});

	it("flips the local flag only around the plugin calls", async () => {
		const session = createAudioSession();
		expect(session.isActive()).toBe(false);
		await session.activate();
		expect(session.isActive()).toBe(true);
		await session.deactivate();
		expect(session.isActive()).toBe(false);
	});

	it("swallows a failing plugin call and warns", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		plugin.activate.mockRejectedValueOnce(new Error("UNIMPLEMENTED"));

		const session = createAudioSession();
		await expect(session.activate()).resolves.toBeUndefined();

		expect(warn).toHaveBeenCalledWith(
			"[gospeak/mobile] AudioSession.activate failed",
			expect.any(Error),
		);
		expect(session.isActive()).toBe(true);
	});

	it("keeps deactivating after a failed activate", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		plugin.activate.mockRejectedValueOnce(new Error("UNIMPLEMENTED"));

		const session = createAudioSession();
		await session.activate();
		await session.deactivate();

		expect(plugin.deactivate).toHaveBeenCalledTimes(1);
		expect(session.isActive()).toBe(false);
	});
});
