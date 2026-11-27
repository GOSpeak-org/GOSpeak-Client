import { describe, expect, it } from "vitest";
import {
	createReconnectPolicy,
	DEFAULT_RECONNECT_BASE_DELAY_MS,
	DEFAULT_RECONNECT_BUDGET_MS,
	DEFAULT_RECONNECT_OFFLINE_DELAY_MS,
} from "./reconnect-policy";

type OnlineSegment = { fromMs: number; online: boolean };

/** 模拟时间线上的在线状态：任何时候都由当前模拟毫秒数决定。 */
function onlineAt(segments: OnlineSegment[], elapsedMs: number): boolean {
	let online = segments[0]?.online ?? true;
	for (const segment of segments) {
		if (elapsedMs >= segment.fromMs) online = segment.online;
	}
	return online;
}

/**
 * 弱网基线（CI 可跑）：把真实弱网场景压成时间线。
 *
 * 取向是快速失败——15s 内接不回来就交回上层完整 re-join，
 * 所以这里断言的是「不会无限磨」，而不是「能一直救」。
 */
describe("reconnect policy under weak-network timelines", () => {
	it("fails fast instead of grinding across a flapping timeline", () => {
		let elapsedMs = 0;
		// 在线 2s → 离线 3s → 恢复在线，但恢复后依然打不通
		const segments: OnlineSegment[] = [
			{ fromMs: 0, online: true },
			{ fromMs: 2_000, online: false },
			{ fromMs: 5_000, online: true },
		];
		const decide = createReconnectPolicy({
			isOnline: () => onlineAt(segments, elapsedMs),
			jitterRatio: 0,
		});

		let retryCount = 0;
		let exhaustedAtMs: number | null = null;
		let exhaustedReason: string | null = null;
		const reasons = new Set<string>();

		while (retryCount < 100) {
			const decision = decide({ retryCount, elapsedMs });
			if (decision.delayMs === null) {
				exhaustedAtMs = elapsedMs;
				exhaustedReason = decision.reason;
				break;
			}
			reasons.add(decision.reason);
			expect(decision.delayMs).toBeGreaterThan(0);
			elapsedMs += decision.delayMs;
			retryCount += 1;
		}

		expect(exhaustedAtMs).toBe(DEFAULT_RECONNECT_BUDGET_MS);
		expect(exhaustedReason).toBe("budget-exhausted");
		// 时间线真的走过了抖动期与离线期，两条分支都被执行
		expect([...reasons].sort()).toEqual(["offline", "retry"]);
		// 快速失败的关键：不会再尝试十几次
		expect(retryCount).toBeLessThanOrEqual(10);
	});

	it("recovers on the first retry for a short tunnel", () => {
		const decide = createReconnectPolicy({
			isOnline: () => true,
			jitterRatio: 0,
		});

		// 3s 抖动，完全落在预算内
		let elapsedMs = 0;
		let retryCount = 0;
		const attempts: number[] = [];
		while (elapsedMs < 3_000) {
			const decision = decide({ retryCount, elapsedMs });
			expect(decision.reason).toBe("retry");
			attempts.push(decision.delayMs as number);
			elapsedMs += decision.delayMs as number;
			retryCount += 1;
		}

		expect(attempts.length).toBeLessThanOrEqual(4);
		expect(attempts[0]).toBe(DEFAULT_RECONNECT_BASE_DELAY_MS);
	});

	it("keeps a slow steady cadence while offline", () => {
		let online = false;
		const decide = createReconnectPolicy({
			isOnline: () => online,
			jitterRatio: 0,
		});

		const offlineDecisions = [0, 2_000, 4_000, 6_000].map((elapsedMs, index) =>
			decide({ retryCount: index, elapsedMs }),
		);

		expect(offlineDecisions.every((d) => d.reason === "offline")).toBe(true);
		// 离线时不指数增长，始终是同一个慢速节奏
		expect(offlineDecisions.map((d) => d.delayMs)).toEqual([
			DEFAULT_RECONNECT_OFFLINE_DELAY_MS,
			DEFAULT_RECONNECT_OFFLINE_DELAY_MS,
			DEFAULT_RECONNECT_OFFLINE_DELAY_MS,
			DEFAULT_RECONNECT_OFFLINE_DELAY_MS,
		]);

		// 离线期结束后回到在线：策略必须恢复基础退避
		online = true;
		expect(decide({ retryCount: 4, elapsedMs: 8_000 })).toEqual({
			delayMs: DEFAULT_RECONNECT_BASE_DELAY_MS,
			reason: "retry",
		});
	});

	it("survives repeated short offline/online flapping inside one budget", () => {
		let online = false;
		const decide = createReconnectPolicy({
			isOnline: () => online,
			jitterRatio: 0,
		});

		// 离线 2s → 恢复 → 再离线 2s → 恢复，总耗时仍远小于预算
		expect(decide({ retryCount: 0, elapsedMs: 0 }).reason).toBe("offline");
		online = true;
		expect(decide({ retryCount: 1, elapsedMs: 2_000 })).toEqual({
			delayMs: DEFAULT_RECONNECT_BASE_DELAY_MS,
			reason: "retry",
		});

		online = false;
		expect(decide({ retryCount: 2, elapsedMs: 4_000 }).reason).toBe("offline");
		online = true;
		expect(decide({ retryCount: 3, elapsedMs: 4_000 })).toEqual({
			delayMs: DEFAULT_RECONNECT_BASE_DELAY_MS,
			reason: "retry",
		});
	});
});
