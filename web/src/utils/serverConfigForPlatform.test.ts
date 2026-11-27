import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
	mobile: false,
	desktopRead: vi.fn(() => "desktop-value"),
	mobileRead: vi.fn(() => "mobile-value"),
}));

vi.mock("@gospeak/desktop", () => ({
	createServerConfig: () => ({
		getBaseUrlSync: h.desktopRead,
		getBaseUrl: async () => h.desktopRead(),
		setBaseUrl: async () => {},
	}),
}));

vi.mock("@gospeak/mobile-capabilities", () => ({
	inMobile: () => h.mobile,
	createServerConfig: () => ({
		getBaseUrlSync: h.mobileRead,
		getBaseUrl: async () => h.mobileRead(),
		setBaseUrl: async () => {},
	}),
}));

import { serverConfigForPlatform } from "./serverConfigForPlatform";

describe("serverConfigForPlatform", () => {
	it("mobile target uses the native-backed mobile config", () => {
		h.mobile = true;
		expect(serverConfigForPlatform().getBaseUrlSync()).toBe("mobile-value");
	});

	it("non-mobile target uses desktop/web config", () => {
		h.mobile = false;
		expect(serverConfigForPlatform().getBaseUrlSync()).toBe("desktop-value");
	});
});
