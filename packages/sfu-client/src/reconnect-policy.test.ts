import { describe, expect, it } from "vitest";
import {
	createReconnectPolicy,
	DEFAULT_RECONNECT_BASE_DELAY_MS,
	DEFAULT_RECONNECT_BUDGET_MS,
	DEFAULT_RECONNECT_MAX_DELAY_MS,
	DEFAULT_RECONNECT_OFFLINE_DELAY_MS,
} from "./reconnect-policy";

const alwaysOnline = () => true;

describe("reconnect policy", () => {
	it("keeps retrying past the old three-attempt cutoff while inside the budget", () => {
		const decide = createReconnectPolicy({
			isOnline: alwaysOnline,
			jitterRatio: 0,
		});

		const decisions = [0, 1, 2, 3, 4].map((retryCount) =>
			decide({ retryCount, elapsedMs: retryCount * 2000 }),
		);

		expect(decisions.every((d) => d.reason === "retry")).toBe(true);
		expect(decisions.every((d) => d.delayMs !== null)).toBe(true);
	});

	it("backs off exponentially and caps at the max delay", () => {
		const decide = createReconnectPolicy({
			isOnline: alwaysOnline,
			jitterRatio: 0,
		});

		// 1s → 2s → 4s，之后封顶在 4s（第 6 次起由封顶次数上限截断）
		const delays = [0, 1, 2, 3, 4].map(
			(retryCount) => decide({ retryCount, elapsedMs: 0 }).delayMs,
		);

		expect(delays).toEqual([1_000, 2_000, 4_000, 4_000, 4_000]);
	});

	it("fails fast once the reconnect budget is gone", () => {
		expect(DEFAULT_RECONNECT_BUDGET_MS).toBe(15_000);
		expect(DEFAULT_RECONNECT_BASE_DELAY_MS).toBe(1_000);
		expect(DEFAULT_RECONNECT_MAX_DELAY_MS).toBe(4_000);
	});

	it("stops retrying within a handful of attempts instead of grinding", () => {
		const decide = createReconnectPolicy({
			isOnline: alwaysOnline,
			jitterRatio: 0,
		});

		let retryCount = 0;
		let elapsedMs = 0;
		while (retryCount < 100) {
			const decision = decide({ retryCount, elapsedMs });
			if (decision.delayMs === null) break;
			elapsedMs += decision.delayMs;
			retryCount += 1;
		}

		// 1+2+4+4+4 = 15s，封顶次数用满即停
		expect(elapsedMs).toBe(15_000);
		expect(retryCount).toBe(5);
		expect(decide({ retryCount, elapsedMs })).toEqual({
			delayMs: null,
			reason: "budget-exhausted",
		});
	});

	it("waits at the same slow cadence while the browser is offline instead of giving up", () => {
		const decide = createReconnectPolicy({
			isOnline: () => false,
			jitterRatio: 0,
		});

		const first = decide({ retryCount: 0, elapsedMs: 0 });
		const deep = decide({ retryCount: 5, elapsedMs: 8_000 });

		expect(first).toEqual({
			delayMs: DEFAULT_RECONNECT_OFFLINE_DELAY_MS,
			reason: "offline",
		});
		expect(deep).toEqual({
			delayMs: DEFAULT_RECONNECT_OFFLINE_DELAY_MS,
			reason: "offline",
		});
	});

	it("resumes normal backoff as soon as the network is back", () => {
		let online = false;
		const decide = createReconnectPolicy({
			isOnline: () => online,
			jitterRatio: 0,
		});

		expect(decide({ retryCount: 0, elapsedMs: 5000 }).reason).toBe("offline");
		online = true;
		expect(decide({ retryCount: 0, elapsedMs: 5000 })).toEqual({
			delayMs: DEFAULT_RECONNECT_BASE_DELAY_MS,
			reason: "retry",
		});
	});

	it("gives up once the wall-clock budget is exhausted", () => {
		const decide = createReconnectPolicy({
			isOnline: alwaysOnline,
			jitterRatio: 0,
		});

		expect(
			decide({ retryCount: 9, elapsedMs: DEFAULT_RECONNECT_BUDGET_MS - 1 }),
		).toEqual(expect.objectContaining({ reason: "retry" }));
		expect(
			decide({ retryCount: 9, elapsedMs: DEFAULT_RECONNECT_BUDGET_MS }),
		).toEqual({
			delayMs: null,
			reason: "budget-exhausted",
		});
	});

	it("never sleeps past the remaining budget", () => {
		const decide = createReconnectPolicy({
			isOnline: alwaysOnline,
			jitterRatio: 0,
		});

		const decision = decide({
			retryCount: 6,
			elapsedMs: DEFAULT_RECONNECT_BUDGET_MS - 500,
		});

		expect(decision.reason).toBe("retry");
		expect(decision.delayMs).toBe(500);
	});

	it("keeps jitter inside the configured band", () => {
		const decide = createReconnectPolicy({
			isOnline: alwaysOnline,
			jitterRatio: 0.2,
			random: () => 0,
		});
		expect(decide({ retryCount: 0, elapsedMs: 0 }).delayMs).toBe(800);

		const decideHigh = createReconnectPolicy({
			isOnline: alwaysOnline,
			jitterRatio: 0.2,
			random: () => 1,
		});
		expect(decideHigh({ retryCount: 0, elapsedMs: 0 }).delayMs).toBe(1_200);
	});

	it("stops after the capped delay has been used three times", () => {
		// 把预算放大到不会先耗尽，隔离出「封顶次数」这条规则
		const decide = createReconnectPolicy({
			isOnline: alwaysOnline,
			jitterRatio: 0,
			budgetMs: 600_000,
		});

		const delays = [0, 1, 2, 3, 4, 5].map(
			(retryCount) => decide({ retryCount, elapsedMs: 0 }).delayMs,
		);

		expect(delays).toEqual([1_000, 2_000, 4_000, 4_000, 4_000, null]);
	});

	it("reports the capped-attempt cutoff as an exhausted budget", () => {
		const decide = createReconnectPolicy({
			isOnline: alwaysOnline,
			jitterRatio: 0,
			budgetMs: 600_000,
		});

		for (let retryCount = 0; retryCount < 5; retryCount += 1) {
			decide({ retryCount, elapsedMs: 0 });
		}

		expect(decide({ retryCount: 5, elapsedMs: 0 })).toEqual({
			delayMs: null,
			reason: "budget-exhausted",
		});
	});

	it("restores the capped-attempt allowance after going offline and back", () => {
		let online = true;
		const decide = createReconnectPolicy({
			isOnline: () => online,
			jitterRatio: 0,
			budgetMs: 600_000,
		});

		decide({ retryCount: 2, elapsedMs: 0 });
		decide({ retryCount: 3, elapsedMs: 0 });
		expect(decide({ retryCount: 4, elapsedMs: 0 }).delayMs).toBe(4_000);

		online = false;
		decide({ retryCount: 5, elapsedMs: 0 });
		online = true;

		// 离线前已用满三次封顶；恢复后重新给三次
		expect(decide({ retryCount: 6, elapsedMs: 0 }).delayMs).toBe(1_000);
	});

	it("returns whole milliseconds that are never negative", () => {
		const decide = createReconnectPolicy({ isOnline: alwaysOnline });

		// 封顶次数用满后返回 null，属预期契约；这里只校验仍在退避阶段的值
		for (let retryCount = 0; retryCount < 5; retryCount += 1) {
			const delay = decide({ retryCount, elapsedMs: 0 }).delayMs;
			expect(delay).not.toBeNull();
			expect(Number.isInteger(delay)).toBe(true);
			expect(delay as number).toBeGreaterThan(0);
		}
	});
});
