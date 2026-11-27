import { describe, expect, it } from "vitest";
import {
	preflightBlockMessage,
	shareFailureMessage,
	type PermissionStatus,
} from "./screenSharePermission";

describe("preflightBlockMessage", () => {
	it("guides the user when screen recording permission is denied on desktop", () => {
		expect(preflightBlockMessage("denied")).toContain("屏幕录制");
	});

	it("treats an unknown status as blocked on macOS where denied is reported until granted", () => {
		expect(preflightBlockMessage("unknown")).toContain("屏幕录制");
	});

	it("stays silent when the permission is granted or unsupported", () => {
		const statuses: PermissionStatus[] = ["granted", "unsupported"];
		for (const status of statuses) {
			expect(preflightBlockMessage(status)).toBeNull();
		}
	});
});

describe("shareFailureMessage", () => {
	it("stays silent for a browser cancellation of the picker", () => {
		expect(
			shareFailureMessage(
				new DOMException("cancelled", "NotAllowedError"),
				false,
			),
		).toBeNull();
	});

	it("shows actionable guidance for the same error inside the desktop WebView", () => {
		expect(
			shareFailureMessage(new DOMException("denied", "NotAllowedError"), true),
		).toContain("屏幕录制");
	});

	it("surfaces unexpected capture failures instead of swallowing them", () => {
		expect(
			shareFailureMessage(new Error("device disconnected"), false),
		).toContain("device disconnected");
	});
});
