import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_BUILD } from "../conditional";
import { createServerConfig, SERVER_BASE_URL_KEY } from "./server";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => {
		store.set(key, String(value));
	},
	removeItem: (key: string) => {
		store.delete(key);
	},
	clear: () => store.clear(),
});

const { plugin, registerPlugin } = vi.hoisted(() => {
	const plugin = {
		getBaseURL: vi.fn(async () => ({ baseUrl: "" })),
		setBaseURL: vi.fn(async () => {}),
	};
	return { plugin, registerPlugin: vi.fn(() => plugin) };
});

vi.mock("@capacitor/core", () => ({ registerPlugin }));

beforeEach(() => {
	store.clear();
	registerPlugin.mockClear();
	registerPlugin.mockImplementation(() => plugin);
	plugin.getBaseURL.mockReset();
	plugin.getBaseURL.mockImplementation(async () => ({ baseUrl: "" }));
	plugin.setBaseURL.mockReset();
	plugin.setBaseURL.mockImplementation(async () => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe.skipIf(MOBILE_BUILD)("createServerConfig web fallback", () => {
	it("reads and writes the localStorage mirror", async () => {
		const config = createServerConfig();
		expect(config.getBaseUrlSync()).toBe("");
		await config.setBaseUrl("https://voice.example.com/");
		expect(localStorage.getItem(SERVER_BASE_URL_KEY)).toBe(
			"https://voice.example.com",
		);
		await expect(config.getBaseUrl()).resolves.toBe(
			"https://voice.example.com",
		);
		expect(registerPlugin).not.toHaveBeenCalled();
	});

	it("drops trailing slashes before persisting", async () => {
		localStorage.setItem(SERVER_BASE_URL_KEY, "https://old.example.com/");
		const config = createServerConfig();
		expect(config.getBaseUrlSync()).toBe("https://old.example.com");

		await config.setBaseUrl("  https://voice.example.com///  ");
		expect(localStorage.getItem(SERVER_BASE_URL_KEY)).toBe(
			"https://voice.example.com",
		);
	});

	it("rejects non-http(s) addresses", async () => {
		await expect(
			createServerConfig().setBaseUrl("ftp://example.com"),
		).rejects.toThrow();
		expect(localStorage.getItem(SERVER_BASE_URL_KEY)).toBeNull();
	});
});

describe.runIf(MOBILE_BUILD)("createServerConfig native plugin", () => {
	it("reads the native value and repairs the mirror", async () => {
		plugin.getBaseURL.mockResolvedValueOnce({
			baseUrl: "https://voice.example.com",
		});
		const config = createServerConfig();
		await expect(config.getBaseUrl()).resolves.toBe(
			"https://voice.example.com",
		);
		expect(registerPlugin).toHaveBeenCalledWith("ServerConfig");
		expect(localStorage.getItem(SERVER_BASE_URL_KEY)).toBe(
			"https://voice.example.com",
		);
	});

	it("forwards setBaseUrl to the native plugin", async () => {
		const config = createServerConfig();
		await config.setBaseUrl("https://next.example.com");
		expect(plugin.setBaseURL).toHaveBeenCalledWith({
			url: "https://next.example.com",
		});
	});

	it("normalizes trailing slashes on read and write", async () => {
		plugin.getBaseURL.mockResolvedValueOnce({
			baseUrl: "https://voice.example.com/",
		});
		const config = createServerConfig();
		await expect(config.getBaseUrl()).resolves.toBe(
			"https://voice.example.com",
		);
		await config.setBaseUrl("https://next.example.com/");
		expect(plugin.setBaseURL).toHaveBeenCalledWith({
			url: "https://next.example.com",
		});
	});

	it("falls back to the mirror when the plugin fails", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		localStorage.setItem(SERVER_BASE_URL_KEY, "https://old.example.com");
		plugin.getBaseURL.mockRejectedValueOnce(new Error("UNIMPLEMENTED"));
		await expect(createServerConfig().getBaseUrl()).resolves.toBe(
			"https://old.example.com",
		);
		expect(warn).toHaveBeenCalled();
	});
});
