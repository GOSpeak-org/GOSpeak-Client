import { describe, expect, it } from "vitest";
import { checkScreenRecording, guideScreenRecording } from "./screenCapture";

describe("screen recording capability browser fallback", () => {
	it("reports granted in a plain browser, where the picker handles permission", async () => {
		expect(await checkScreenRecording()).toBe("granted");
	});

	it("does not try to open system settings in a browser", async () => {
		expect(await guideScreenRecording()).toBe("granted");
	});
});
