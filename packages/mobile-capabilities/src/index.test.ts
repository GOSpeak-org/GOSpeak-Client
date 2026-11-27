import { describe, expect, it } from "vitest";
import { BUILD_TARGET, createMobile } from "./index";

describe("createMobile", () => {
	it("exposes every capability", () => {
		const mobile = createMobile();
		expect(Object.keys(mobile).sort()).toEqual([
			"audioRoute",
			"audioSession",
			"backButton",
			"deepLink",
			"keyboard",
			"lifecycle",
			"localNotification",
			"mediaControl",
			"push",
			"runtime",
			"serverConfig",
		]);
	});

	it("reports the runtime kind", () => {
		expect(["web", "desktop", "mobile"]).toContain(createMobile().runtime);
		expect(createMobile().runtime).toBe(BUILD_TARGET);
	});

	it("exposes the documented audioSession methods", () => {
		const { audioSession } = createMobile();
		expect(typeof audioSession.activate).toBe("function");
		expect(typeof audioSession.deactivate).toBe("function");
		expect(typeof audioSession.isActive).toBe("function");
	});

	it("exposes the documented audioRoute methods", () => {
		const { audioRoute } = createMobile();
		expect(typeof audioRoute.list).toBe("function");
		expect(typeof audioRoute.current).toBe("function");
		expect(typeof audioRoute.set).toBe("function");
	});

	it("exposes the documented mediaControl methods", () => {
		const { mediaControl } = createMobile();
		expect(typeof mediaControl.setMetadata).toBe("function");
		expect(typeof mediaControl.clear).toBe("function");
		expect(typeof mediaControl.onAction).toBe("function");
	});

	it("exposes the documented push methods", () => {
		const { push } = createMobile();
		expect(typeof push.register).toBe("function");
		expect(typeof push.onToken).toBe("function");
		expect(typeof push.onNotificationOpened).toBe("function");
	});

	it("exposes the documented deepLink methods", () => {
		const { deepLink } = createMobile();
		expect(typeof deepLink.initial).toBe("function");
		expect(typeof deepLink.onLink).toBe("function");
	});

	it("exposes the documented lifecycle methods", () => {
		const { lifecycle } = createMobile();
		expect(typeof lifecycle.onStateChange).toBe("function");
	});

	it("exposes the documented localNotification methods", () => {
		const { localNotification } = createMobile();
		expect(typeof localNotification.notify).toBe("function");
		expect(typeof localNotification.cancel).toBe("function");
	});

	it("keeps every capability independent across instances", () => {
		const first = createMobile();
		const second = createMobile();
		expect(first.audioSession).not.toBe(second.audioSession);
		expect(first.push).not.toBe(second.push);
		expect(first.deepLink).not.toBe(second.deepLink);
	});
});
