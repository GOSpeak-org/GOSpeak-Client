import { describe, expect, it } from "vitest";
import {
	isErrorStorm,
	isUncaughtError,
	STORM_THRESHOLD,
	STORM_WINDOW_MS,
	uncaughtErrorTimestamps,
} from "./clientLogFatal";
import type { ClientLogEntry } from "./clientLog";

const NOW = 1_700_000_000_000;

function entry(
	scope: string,
	ts: number,
	level: "error" | "warn" = "error",
): ClientLogEntry {
	return { id: `${scope}-${ts}`, ts, level, scope, message: "x" };
}

describe("isErrorStorm", () => {
	it("is false below the threshold", () => {
		const ts = Array.from({ length: STORM_THRESHOLD - 1 }, () => NOW - 1000);
		expect(isErrorStorm(ts, NOW)).toBe(false);
	});

	it("is true at the threshold", () => {
		const ts = Array.from({ length: STORM_THRESHOLD }, () => NOW - 1000);
		expect(isErrorStorm(ts, NOW)).toBe(true);
	});

	it("ignores errors older than the window", () => {
		const fresh = Array.from({ length: STORM_THRESHOLD - 1 }, () => NOW - 1000);
		const stale = Array.from({ length: 10 }, () => NOW - STORM_WINDOW_MS - 1);
		expect(isErrorStorm([...fresh, ...stale], NOW)).toBe(false);
	});

	it("counts exactly at the window edge", () => {
		const ts = Array.from(
			{ length: STORM_THRESHOLD },
			() => NOW - STORM_WINDOW_MS,
		);
		expect(isErrorStorm(ts, NOW)).toBe(true);
	});
});

describe("isUncaughtError", () => {
	it("accepts the uncaught scopes", () => {
		expect(isUncaughtError(entry("window.error", NOW))).toBe(true);
		expect(isUncaughtError(entry("window.unhandledrejection", NOW))).toBe(true);
		expect(isUncaughtError(entry("global", NOW))).toBe(true);
	});

	it("rejects handled scopes and non-errors", () => {
		expect(isUncaughtError(entry("component", NOW))).toBe(false);
		expect(isUncaughtError(entry("socket", NOW))).toBe(false);
		expect(isUncaughtError(entry("window.error", NOW, "warn"))).toBe(false);
	});
});

describe("uncaughtErrorTimestamps", () => {
	it("keeps only uncaught errors", () => {
		const entries = [
			entry("window.error", 1),
			entry("socket", 2),
			entry("global", 3),
			entry("component", 4),
		];
		expect(uncaughtErrorTimestamps(entries)).toEqual([1, 3]);
	});
});
