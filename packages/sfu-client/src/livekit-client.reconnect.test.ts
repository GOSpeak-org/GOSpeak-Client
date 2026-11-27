import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_RECONNECT_BASE_DELAY_MS,
	DEFAULT_RECONNECT_BUDGET_MS,
	DEFAULT_RECONNECT_MAX_DELAY_MS,
	DEFAULT_RECONNECT_OFFLINE_DELAY_MS,
} from "./reconnect-policy";

const rooms: Array<{ options: Record<string, any> }> = [];

vi.mock("livekit-client", () => {
	class Room {
		static instances: Room[] = [];
		options: Record<string, any>;
		state = "connected";
		localParticipant = {
			setMicrophoneEnabled: async () => {},
			setCameraEnabled: async () => {},
			setScreenShareEnabled: async () => {},
			trackPublications: new Map(),
			getTrackPublication: () => undefined,
		};
		remoteParticipants = new Map();
		constructor(options: Record<string, any>) {
			this.options = options;
			Room.instances.push(this);
			rooms.push(this as never);
		}
		on() {
			return this;
		}
		removeAllListeners() {}
		async disconnect() {}
	}
	return {
		Room,
		RoomEvent: {
			Disconnected: "disconnected",
			Reconnecting: "reconnecting",
			Reconnected: "reconnected",
			ActiveSpeakersChanged: "activeSpeakersChanged",
			TrackSubscribed: "trackSubscribed",
			TrackUnsubscribed: "trackUnsubscribed",
			LocalTrackPublished: "localTrackPublished",
			LocalTrackUnpublished: "localTrackUnpublished",
		},
		LogLevel: { warn: "warn" },
		setLogLevel: () => {},
		DisconnectReason: { DUPLICATE_IDENTITY: "DUPLICATE_IDENTITY" },
		Track: {
			Kind: { Audio: "audio", Video: "video" },
			Source: { ScreenShare: "screen_share" },
		},
		VideoPresets: { h720: { resolution: { width: 1280, height: 720 } } },
	};
});

describe("LiveKit reconnect wiring", () => {
	beforeEach(() => {
		rooms.length = 0;
		// 抖动固定为 ×1.0，退避才可被断言为精确值（策略默认抖动 ±20%）。
		vi.spyOn(Math, "random").mockReturnValue(0.5);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("keeps reconnecting with capped backoff until the budget runs out", async () => {
		const { LiveKitSFUClient } = await import("./livekit-client");
		new LiveKitSFUClient({ isOnline: () => true });

		const policy = rooms[0].options.reconnectPolicy;
		const delays: number[] = [];
		let elapsedMs = 0;
		for (const retryCount of [0, 1, 2, 3, 4]) {
			const delay = policy.nextRetryDelayInMs({ retryCount, elapsedMs });
			expect(delay).not.toBeNull();
			delays.push(delay as number);
			elapsedMs += delay as number;
		}

		expect(delays).toEqual([
			DEFAULT_RECONNECT_BASE_DELAY_MS,
			DEFAULT_RECONNECT_BASE_DELAY_MS * 2,
			DEFAULT_RECONNECT_MAX_DELAY_MS,
			DEFAULT_RECONNECT_MAX_DELAY_MS,
			DEFAULT_RECONNECT_MAX_DELAY_MS,
		]);
		// 墙钟恰好推进到预算上限：此时才允许放弃自动重连
		expect(elapsedMs).toBe(DEFAULT_RECONNECT_BUDGET_MS);
		expect(policy.nextRetryDelayInMs({ retryCount: 5, elapsedMs })).toBeNull();
	});

	it("stops after three capped 4s backoffs even inside the budget", async () => {
		const { LiveKitSFUClient } = await import("./livekit-client");
		new LiveKitSFUClient({ isOnline: () => true });

		const policy = rooms[0].options.reconnectPolicy;
		// 预算还剩 9s：这里的放弃只能来自封顶次数用尽，而不是预算耗尽
		const elapsedMs = 6_000;
		for (const retryCount of [2, 3, 4]) {
			expect(policy.nextRetryDelayInMs({ retryCount, elapsedMs })).toBe(
				DEFAULT_RECONNECT_MAX_DELAY_MS,
			);
		}
		expect(policy.nextRetryDelayInMs({ retryCount: 5, elapsedMs })).toBeNull();
	});

	it("stops auto-reconnect once the time budget is exhausted", async () => {
		const { LiveKitSFUClient } = await import("./livekit-client");
		new LiveKitSFUClient({ isOnline: () => true });

		const policy = rooms[0].options.reconnectPolicy;
		// 预算的最后一毫秒仍然给一次重试（退避被夹到剩余预算），到点才放弃
		expect(
			policy.nextRetryDelayInMs({
				retryCount: 1,
				elapsedMs: DEFAULT_RECONNECT_BUDGET_MS - 1,
			}),
		).toBe(1);
		expect(
			policy.nextRetryDelayInMs({
				retryCount: 1,
				elapsedMs: DEFAULT_RECONNECT_BUDGET_MS,
			}),
		).toBeNull();
	});

	it("falls back to a slow retry cadence while the browser reports offline", async () => {
		const { LiveKitSFUClient } = await import("./livekit-client");
		new LiveKitSFUClient({ isOnline: () => false });

		const policy = rooms[0].options.reconnectPolicy;
		const shallow = policy.nextRetryDelayInMs({ retryCount: 0, elapsedMs: 0 });
		const deep = policy.nextRetryDelayInMs({ retryCount: 4, elapsedMs: 5_000 });

		// 离线时退避不再指数增长：始终是同一个慢速节奏
		expect(shallow).toBe(DEFAULT_RECONNECT_OFFLINE_DELAY_MS);
		expect(deep).toBe(DEFAULT_RECONNECT_OFFLINE_DELAY_MS);
	});
});
