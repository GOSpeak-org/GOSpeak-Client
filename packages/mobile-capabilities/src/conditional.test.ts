import { afterEach, describe, expect, it, vi } from "vitest";
import {
	BUILD_TARGET,
	DESKTOP_BUILD,
	MOBILE_BUILD,
	WEB_BUILD,
	inMobile,
	isCapacitor,
} from "./conditional";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("build target constants", () => {
	it("mirrors the injected __GOSPEAK_TARGET__ token", () => {
		expect(BUILD_TARGET).toBe(__GOSPEAK_TARGET__);
	});

	it("MOBILE_BUILD mirrors the injected __GOSPEAK_MOBILE__ token", () => {
		expect(MOBILE_BUILD).toBe(__GOSPEAK_MOBILE__);
	});

	it("DESKTOP_BUILD / WEB_BUILD stay consistent and exclusive", () => {
		expect(DESKTOP_BUILD).toBe(BUILD_TARGET === "desktop");
		expect(WEB_BUILD).toBe(!MOBILE_BUILD && !DESKTOP_BUILD);
		expect(MOBILE_BUILD && DESKTOP_BUILD).toBe(false);
	});
});

describe("isCapacitor", () => {
	it("is false when the Capacitor global is absent", () => {
		vi.stubGlobal("Capacitor", undefined);
		expect(isCapacitor()).toBe(false);
	});

	it("is true when the runtime reports a native platform", () => {
		vi.stubGlobal("Capacitor", { isNativePlatform: () => true });
		expect(isCapacitor()).toBe(true);
	});

	it("is false when the runtime reports a web platform", () => {
		vi.stubGlobal("Capacitor", { isNativePlatform: () => false });
		expect(isCapacitor()).toBe(false);
	});

	it("is false when the probe throws", () => {
		vi.stubGlobal("Capacitor", {
			isNativePlatform: () => {
				throw new Error("bridge unavailable");
			},
		});
		expect(isCapacitor()).toBe(false);
	});

	it("is false when isNativePlatform is not a function", () => {
		vi.stubGlobal("Capacitor", { isNativePlatform: true });
		expect(isCapacitor()).toBe(false);
	});
});

describe("inMobile", () => {
	it("equals MOBILE_BUILD when no Capacitor runtime is present", () => {
		vi.stubGlobal("Capacitor", undefined);
		expect(inMobile()).toBe(MOBILE_BUILD);
	});

	describe.runIf(MOBILE_BUILD)("in a mobile build", () => {
		it("returns true without a Capacitor runtime", () => {
			vi.stubGlobal("Capacitor", undefined);
			expect(inMobile()).toBe(true);
		});

		it("returns true even when the runtime reports a web platform", () => {
			vi.stubGlobal("Capacitor", { isNativePlatform: () => false });
			expect(inMobile()).toBe(true);
		});
	});

	describe.skipIf(MOBILE_BUILD)("in a non-mobile build", () => {
		it("returns false without a Capacitor runtime", () => {
			vi.stubGlobal("Capacitor", undefined);
			expect(inMobile()).toBe(false);
		});

		it("returns true when the Capacitor runtime is native", () => {
			vi.stubGlobal("Capacitor", { isNativePlatform: () => true });
			expect(inMobile()).toBe(true);
		});
	});
});
