import { beforeEach, describe, expect, it } from "vitest";
import {
	buildLogText,
	clearLogs,
	currentEntries,
	exportFileName,
	formatTs,
	log,
	redact,
} from "./clientLog";

describe("redact", () => {
	it("blanks bearer tokens", () => {
		expect(redact("Authorization: Bearer abc.def-ghi_jkl123")).not.toContain(
			"abc.def",
		);
	});

	it("blanks secret query parameters but keeps the name", () => {
		const out = redact("GET /api/x?token=s3cret&code=abc123&id=7");
		expect(out).toContain("token=***");
		expect(out).toContain("code=***");
		expect(out).toContain("id=7");
		expect(out).not.toContain("s3cret");
	});

	it("blanks cookie and authorization headers", () => {
		const out = redact("cookie: session=abc\nAuthorization: Basic zzz");
		expect(out).not.toContain("session=abc");
		expect(out).not.toContain("Basic zzz");
	});
});

describe("log", () => {
	beforeEach(async () => {
		await clearLogs();
	});

	it("appends entries with increasing timestamps", () => {
		log("error", "socket", "boom");
		log("warn", "socket", "hmm");
		const entries = currentEntries();
		expect(entries).toHaveLength(2);
		expect(entries[0].level).toBe("error");
		expect(entries[1].level).toBe("warn");
	});

	it("dedupes the same message within the window", () => {
		const first = log("error", "global", "same");
		const second = log("error", "global", "same");
		expect(first).not.toBeNull();
		expect(second).toBeNull();
		expect(currentEntries()).toHaveLength(1);
	});

	it("records a different scope as a new entry", () => {
		log("error", "global", "same");
		log("error", "socket", "same");
		expect(currentEntries()).toHaveLength(2);
	});

	it("redacts the message on the way in", () => {
		log("error", "http", "failed https://x/api?token=abc123");
		expect(currentEntries()[0].message).not.toContain("abc123");
	});

	it("keeps at most 500 entries", () => {
		for (let i = 0; i < 520; i++) {
			// 每条 message 不同，避免命中 1s 去重窗口
			log("info", "bulk", `entry-${i}`);
		}
		expect(currentEntries()).toHaveLength(500);
		expect(currentEntries()[0].message).toBe("entry-20");
	});

	it("drops entries older than the 7 day TTL", () => {
		const stale = Date.now() - 8 * 24 * 60 * 60 * 1000;
		// 直接写内存后触发一次 trim
		log("info", "seed", "old");
		const entries = currentEntries();
		entries[0].ts = stale;
		log("info", "seed", "new");
		const kept = currentEntries();
		expect(kept.every((e) => e.ts > stale)).toBe(true);
	});
});

describe("buildLogText", () => {
	it("merges client and host entries in time order with a header", () => {
		const text = buildLogText(
			[
				{
					id: "a",
					ts: Date.UTC(2026, 0, 1, 0, 0, 2),
					level: "error",
					scope: "console",
					message: "client-marker",
				},
			],
			[
				{
					id: "b",
					ts: Date.UTC(2026, 0, 1, 0, 0, 1),
					level: "warn",
					scope: "host",
					message: "host-marker",
				},
			],
			{
				version: "1.0.3",
				runtime: "desktop",
				platform: "MacIntel",
				server: "https://api.example",
			},
			Date.UTC(2026, 0, 1, 0, 0, 3),
		);

		expect(text).toContain("版本: 1.0.3");
		expect(text).toContain("运行环境: desktop");
		expect(text).toContain("服务器: https://api.example");
		expect(text).toContain("前端日志: 1 条");
		expect(text).toContain("宿主日志: 1 条");
		// 两段分开渲染：前端段在前、宿主段在后
		expect(text.indexOf("client-marker")).toBeLessThan(
			text.indexOf("host-marker"),
		);
		// 时间范围取合并后的最早与最晚，宿主那条更早
		const hostLine = formatTs(Date.UTC(2026, 0, 1, 0, 0, 1));
		expect(text).toContain(`时间范围: ${hostLine}`);
	});

	it("marks empty sections instead of leaving them blank", () => {
		const text = buildLogText(
			[],
			[],
			{ version: "dev", runtime: "web", platform: "", server: "" },
			0,
		);
		expect(text).toContain("(未配置)");
		expect(text).toContain("(无)");
	});
});

describe("formatting", () => {
	it("formats timestamps with millisecond precision", () => {
		const ts = new Date(2026, 10, 15, 22, 3, 1, 45).getTime();
		expect(formatTs(ts)).toBe("2026-11-15 22:03:01.045");
	});

	it("names exports by local date and time", () => {
		const ts = new Date(2026, 10, 15, 22, 3, 1).getTime();
		expect(exportFileName(ts)).toBe("gospeak-log-20261115-220301.txt");
	});
});
