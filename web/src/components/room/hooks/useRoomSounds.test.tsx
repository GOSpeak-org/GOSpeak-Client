import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VoicePhase } from "@/components/room/session/voiceSessionTypes";

vi.mock("@/handler_audio/notificationSounds", () => ({
	playJoinSound: vi.fn(),
	playLeaveSound: vi.fn(),
	setNotificationSoundEnabled: vi.fn(),
}));
vi.mock("@/stores/audioDeviceStore", () => ({
	useAudioDeviceStore: (selector: (s: unknown) => unknown) =>
		selector({ notificationSounds: true }),
}));
vi.mock("@/stores/socketStore", () => ({
	socketStore: { onPresence: vi.fn(() => () => {}) },
	useSocketStore: { getState: () => ({ selectedRoomInfo: null }) },
}));
vi.mock("@/stores/userStore", () => ({
	useUserStore: { getState: () => ({ user: { name: "alice" } }) },
}));

import {
	playJoinSound,
	playLeaveSound,
} from "@/handler_audio/notificationSounds";
import { useRoomSounds } from "./useRoomSounds";

describe("useRoomSounds 切房提示音", () => {
	beforeEach(() => {
		vi.mocked(playJoinSound).mockClear();
		vi.mocked(playLeaveSound).mockClear();
	});

	it("切房时播放离开音，并在新房就绪时重新播放进入音", () => {
		const { rerender } = renderHook(
			({ phase, room }: { phase: VoicePhase; room: string | null }) =>
				useRoomSounds(phase, room),
			{
				initialProps: {
					phase: "ready" as VoicePhase,
					room: "A" as string | null,
				},
			},
		);
		expect(playJoinSound).toHaveBeenCalledTimes(1);
		expect(playLeaveSound).not.toHaveBeenCalled();

		// React 18 批处理会让 resolving 被 loading_sfu 覆盖，phase 从 ready 直接跳到 loading_sfu
		rerender({ phase: "loading_sfu", room: "B" });
		expect(playLeaveSound).toHaveBeenCalledTimes(1);

		rerender({ phase: "ready", room: "B" });
		expect(playJoinSound).toHaveBeenCalledTimes(2);
	});

	it("手动离房播放离开音，异常 failed 不播放", () => {
		const { rerender } = renderHook(
			({ phase, room }: { phase: VoicePhase; room: string | null }) =>
				useRoomSounds(phase, room),
			{
				initialProps: {
					phase: "ready" as VoicePhase,
					room: "A" as string | null,
				},
			},
		);
		rerender({ phase: "failed", room: "A" });
		expect(playLeaveSound).not.toHaveBeenCalled();
		rerender({ phase: "idle", room: null });
		expect(playLeaveSound).toHaveBeenCalledTimes(1);
	});
});
