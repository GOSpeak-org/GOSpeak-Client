import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, setMock } = vi.hoisted(() => ({
	getMock: vi.fn(),
	setMock: vi.fn(async () => {}),
}));

vi.mock("idb-keyval", () => ({
	get: getMock,
	set: setMock,
}));

const STORAGE_KEY = "screenShareSettingsStore";

async function loadStore() {
	vi.resetModules();
	return import("./screenShareSettingsStore");
}

function flushDebounce() {
	vi.advanceTimersByTime(260);
}

describe("screenShareSettingsStore", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		getMock.mockReset();
		setMock.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("falls back to the default quality when nothing is persisted", async () => {
		getMock.mockResolvedValue(undefined);
		const { default: ScreenShareSettingsStore } = await loadStore();

		expect(ScreenShareSettingsStore.state.quality).toBe("1080p");
	});

	it("restores a persisted quality", async () => {
		getMock.mockResolvedValue({ quality: "720p" });
		const { default: ScreenShareSettingsStore } = await loadStore();

		expect(ScreenShareSettingsStore.state.quality).toBe("720p");
	});

	it("falls back to the default quality for unknown persisted values", async () => {
		getMock.mockResolvedValue({ quality: "4k" });
		const { default: ScreenShareSettingsStore } = await loadStore();

		expect(ScreenShareSettingsStore.state.quality).toBe("1080p");
	});

	it("persists only the quality after setQuality", async () => {
		getMock.mockResolvedValue(undefined);
		const { default: ScreenShareSettingsStore } = await loadStore();

		ScreenShareSettingsStore.setQuality("480p");
		expect(ScreenShareSettingsStore.state.quality).toBe("480p");

		flushDebounce();

		expect(setMock).toHaveBeenCalledWith(STORAGE_KEY, { quality: "480p" });
	});

	it("keeps the default quality when loading throws", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		getMock.mockRejectedValue(new Error("idb unavailable"));
		const { default: ScreenShareSettingsStore } = await loadStore();

		expect(ScreenShareSettingsStore.state.quality).toBe("1080p");
		expect(errorSpy).toHaveBeenCalled();
		errorSpy.mockRestore();
	});
});
