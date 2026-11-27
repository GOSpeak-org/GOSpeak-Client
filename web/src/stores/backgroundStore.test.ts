import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getBackground: vi.fn(),
	putBackground: vi.fn(),
	deleteBackground: vi.fn(),
	compressImage: vi.fn(),
	toastActionError: vi.fn((_error: unknown, fallback: string) => fallback),
}));

vi.mock("@/utils/backgroundDb", () => ({
	getBackground: mocks.getBackground,
	putBackground: mocks.putBackground,
	deleteBackground: mocks.deleteBackground,
}));
vi.mock("@/utils/backgroundImage", () => ({
	compressImage: mocks.compressImage,
}));
vi.mock("@/utils/toast", () => ({
	toastActionError: mocks.toastActionError,
}));

import {
	activePreset,
	backgroundStore,
	createBackgroundStore,
	useBackgroundStore,
} from "./backgroundStore";

const imageBlob = new Blob(["image"], { type: "image/webp" });
const compressedBlob = new Blob(["compressed"], { type: "image/webp" });

let storedBlob: Blob | null = null;
let urlCounter = 0;

beforeEach(() => {
	urlCounter = 0;
	localStorage.clear();
	vi.stubGlobal("indexedDB", { open: vi.fn() });
	vi.clearAllMocks();
	storedBlob = null;
	mocks.getBackground.mockImplementation(async () => storedBlob);
	mocks.putBackground.mockImplementation(async (blob: Blob) => {
		storedBlob = blob;
	});
	mocks.deleteBackground.mockImplementation(async () => {
		storedBlob = null;
	});
	URL.createObjectURL = vi.fn(() => `blob:mock-${urlCounter++}`);
	URL.revokeObjectURL = vi.fn();
	document.documentElement.className = "";
	document.documentElement.style.cssText = "";
	document.body.style.backgroundImage = "";
	createBackgroundStore();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("backgroundStore", () => {
	it("init loads the shared image and applies glass variables", async () => {
		storedBlob = imageBlob;
		await backgroundStore.init();
		const state = useBackgroundStore.getState();
		expect(state.hasImage).toBe(true);
		expect(state.activeUrl).toBe("blob:mock-0");
		expect(document.documentElement.classList.contains("bg-custom")).toBe(true);
		expect(document.documentElement.style.getPropertyValue("--bg-blur")).toBe(
			"14px",
		);
		expect(
			document.documentElement.style.getPropertyValue("--bg-card-alpha"),
		).toBe("68%");
		expect(
			document.documentElement.style.getPropertyValue("--bg-muted-alpha"),
		).toBe("51%");
		expect(document.body.style.backgroundImage).toBe('url("blob:mock-0")');
	});

	it("init marks the feature unavailable when IndexedDB fails", async () => {
		mocks.getBackground.mockRejectedValue(new Error("boom"));
		await backgroundStore.init();
		expect(useBackgroundStore.getState().available).toBe(false);
		expect(document.documentElement.classList.contains("bg-custom")).toBe(
			false,
		);
	});

	it("setImage compresses, stores and refreshes", async () => {
		mocks.compressImage.mockResolvedValue(compressedBlob);
		const file = new File(["raw"], "bg.png", { type: "image/png" });
		await backgroundStore.setImage(file);
		expect(mocks.compressImage).toHaveBeenCalledWith(file);
		expect(storedBlob).toBe(compressedBlob);
		expect(useBackgroundStore.getState().hasImage).toBe(true);
		expect(useBackgroundStore.getState().activeUrl).toBe("blob:mock-0");
	});

	it("setImage rejects non-image files without storing", async () => {
		const file = new File(["x"], "notes.txt", { type: "text/plain" });
		await backgroundStore.setImage(file);
		expect(mocks.compressImage).not.toHaveBeenCalled();
		expect(mocks.toastActionError).toHaveBeenCalled();
		expect(storedBlob).toBeNull();
	});

	it("removeImage clears storage and DOM state", async () => {
		storedBlob = imageBlob;
		await backgroundStore.init();
		expect(useBackgroundStore.getState().activeUrl).not.toBeNull();
		await backgroundStore.removeImage();
		expect(useBackgroundStore.getState().hasImage).toBe(false);
		expect(useBackgroundStore.getState().activeUrl).toBeNull();
		expect(document.documentElement.classList.contains("bg-custom")).toBe(
			false,
		);
		expect(document.documentElement.style.getPropertyValue("--bg-blur")).toBe(
			"",
		);
		expect(document.body.style.backgroundImage).toBe("");
	});

	it("setGlass clamps, persists and updates the DOM variables", async () => {
		storedBlob = imageBlob;
		await backgroundStore.init();
		backgroundStore.setGlass({ strength: 150, opacity: -20 });
		expect(useBackgroundStore.getState().glass).toEqual({
			strength: 100,
			opacity: 0,
		});
		expect(
			JSON.parse(localStorage.getItem("background-glass") ?? "{}"),
		).toEqual({ strength: 100, opacity: 0 });
		expect(document.documentElement.style.getPropertyValue("--bg-blur")).toBe(
			"24px",
		);
		expect(
			document.documentElement.style.getPropertyValue("--bg-card-alpha"),
		).toBe("0%");
		expect(activePreset(useBackgroundStore.getState().glass)).toBe("custom");
	});

	it("applyPreset persists and restores both sliders", async () => {
		storedBlob = imageBlob;
		await backgroundStore.init();
		backgroundStore.applyPreset("immersive");
		expect(useBackgroundStore.getState().glass).toEqual({
			strength: 83,
			opacity: 40,
		});
		expect(
			JSON.parse(localStorage.getItem("background-glass") ?? "{}"),
		).toEqual({ strength: 83, opacity: 40 });
		expect(document.documentElement.style.getPropertyValue("--bg-blur")).toBe(
			"20px",
		);
	});

	it("migrates a legacy tier preference into slider values", () => {
		localStorage.setItem("background-tier-light", "subtle");
		createBackgroundStore();
		expect(useBackgroundStore.getState().glass).toEqual({
			strength: 25,
			opacity: 85,
		});
	});
});
