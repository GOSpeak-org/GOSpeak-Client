/**
 * 断线重连节奏策略。
 *
 * 用 LiveKit 提供的墙钟 `elapsedMs` 做预算，而不是数重试次数。
 *
 * 取向是**快速失败**：15s 内接不回来就交回上层做完整 re-join（重取 token 重连），
 * 而不是让用户对着「正在重连」干等。退避 1s → 2s → 4s 封顶。
 *
 * 离线时降到 1s 慢速节奏继续等（此时快速失败没有意义，重试必然打不通），
 * 网络一恢复立刻回到基础退避；真正的放弃只发生在预算耗尽时。
 */

export const DEFAULT_RECONNECT_BUDGET_MS = 15_000;
export const DEFAULT_RECONNECT_BASE_DELAY_MS = 1_000;
export const DEFAULT_RECONNECT_MAX_DELAY_MS = 4_000;
export const DEFAULT_RECONNECT_OFFLINE_DELAY_MS = 1_000;
export const DEFAULT_RECONNECT_JITTER_RATIO = 0.2;
/** 封顶退避最多用几次；用满仍接不回来就判定失败，避免用户长时间干等。 */
export const DEFAULT_RECONNECT_MAX_CAPPED_ATTEMPTS = 3;

export type ReconnectDecisionReason = "retry" | "offline" | "budget-exhausted";

export interface ReconnectDecision {
	/** 下次重试前等待的毫秒数；null 表示放弃自动重连。 */
	delayMs: number | null;
	reason: ReconnectDecisionReason;
}

/** 与 LiveKit `ReconnectContext` 对齐的最小输入，便于纯函数测试。 */
export interface ReconnectContextLike {
	retryCount: number;
	elapsedMs: number;
}

export interface ReconnectPolicyOptions {
	budgetMs?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	offlineDelayMs?: number;
	jitterRatio?: number;
	/** 浏览器在线探测；未提供时视为始终在线。 */
	isOnline?: () => boolean;
	/** 随机源，测试可注入可预测序列。 */
	random?: () => number;
	/** 封顶退避的最大使用次数，用满即放弃。 */
	maxCappedAttempts?: number;
}

export type ReconnectDecider = (
	context: ReconnectContextLike,
) => ReconnectDecision;

export function createReconnectPolicy(
	options: ReconnectPolicyOptions = {},
): ReconnectDecider {
	const budgetMs = options.budgetMs ?? DEFAULT_RECONNECT_BUDGET_MS;
	const baseDelayMs = options.baseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS;
	const maxDelayMs = options.maxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
	const offlineDelayMs =
		options.offlineDelayMs ?? DEFAULT_RECONNECT_OFFLINE_DELAY_MS;
	const jitterRatio = options.jitterRatio ?? DEFAULT_RECONNECT_JITTER_RATIO;
	const maxCappedAttempts =
		options.maxCappedAttempts ?? DEFAULT_RECONNECT_MAX_CAPPED_ATTEMPTS;
	const isOnline = options.isOnline ?? (() => true);
	const random = options.random ?? Math.random;

	// 刚从离线恢复：此时 retryCount 已被离线期间的探测次数推高，
	// 若继续按它退避，网络明明回来了还要白等一个指数窗口。恢复时从零退避。
	let wasOffline = false;
	// 已用掉的封顶退避次数；恢复在线时清零，保证抖动后仍有完整的三次机会
	let cappedAttempts = 0;

	return ({ retryCount, elapsedMs }) => {
		const remainingMs = budgetMs - elapsedMs;
		if (remainingMs <= 0) {
			return { delayMs: null, reason: "budget-exhausted" };
		}

		if (!isOnline()) {
			wasOffline = true;
			cappedAttempts = 0;
			return {
				delayMs: Math.max(1, Math.min(offlineDelayMs, remainingMs)),
				reason: "offline",
			};
		}

		if (wasOffline) cappedAttempts = 0;
		const effectiveRetryCount = wasOffline ? 0 : Math.max(0, retryCount);
		wasOffline = false;

		const base = Math.min(baseDelayMs * 2 ** effectiveRetryCount, maxDelayMs);
		if (base >= maxDelayMs) {
			if (cappedAttempts >= maxCappedAttempts) {
				return { delayMs: null, reason: "budget-exhausted" };
			}
			cappedAttempts += 1;
		}
		const jittered = Math.round(base * (1 + (random() * 2 - 1) * jitterRatio));

		return {
			delayMs: Math.max(1, Math.min(jittered, remainingMs)),
			reason: "retry",
		};
	};
}
