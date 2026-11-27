import { describe, expect, it, vi } from "vitest";

vi.mock("@/stores/voiceChatStore", () => ({
	useVoiceChatStore: { getState: () => ({ otherMemberState: {} }) },
}));

import { EVENTS } from "@/socket/events";
import { socketStore, useSocketStore } from "@/stores/socketStore";
import { cleanupAudioHandler, setupAudioHandler } from "./index";

describe("setupAudioHandler", () => {
	it("does not rebind when called twice with same client", () => {
		const client = {
			onRemoteAudioTrack: vi.fn(),
			onRemoteAudioTrackRemoved: vi.fn(),
			onActiveSpeakers: vi.fn(),
			getExistingRemoteAudioTracks: vi.fn(() => []),
		};
		setupAudioHandler(client as any);
		setupAudioHandler(client as any);
		expect(client.onRemoteAudioTrack).toHaveBeenCalledTimes(1);
		cleanupAudioHandler();
	});

	it("rebinds when client instance changes", () => {
		const a = {
			onRemoteAudioTrack: vi.fn(),
			onRemoteAudioTrackRemoved: vi.fn(),
			onActiveSpeakers: vi.fn(),
			getExistingRemoteAudioTracks: vi.fn(() => []),
		};
		const b = {
			onRemoteAudioTrack: vi.fn(),
			onRemoteAudioTrackRemoved: vi.fn(),
			onActiveSpeakers: vi.fn(),
			getExistingRemoteAudioTracks: vi.fn(() => []),
		};
		setupAudioHandler(a as any);
		setupAudioHandler(b as any);
		expect(a.onRemoteAudioTrack).toHaveBeenCalledTimes(1);
		expect(b.onRemoteAudioTrack).toHaveBeenCalledTimes(1);
		cleanupAudioHandler();
	});

	it("reports local speaking changes via member:speaking", () => {
		const previousRoom = useSocketStore.getState().currentRoom;
		useSocketStore.setState({ currentRoom: "lobby" });
		const emitSpy = vi
			.spyOn(socketStore.getSocket(), "emitFireAndForget")
			.mockReturnValue(true);
		let onSpeaking!: (speaking: boolean) => void;
		const client = {
			onRemoteAudioTrack: vi.fn(),
			onRemoteAudioTrackRemoved: vi.fn(),
			onActiveSpeakers: vi.fn(),
			onLocalSpeakingChange: vi.fn((cb: (speaking: boolean) => void) => {
				onSpeaking = cb;
			}),
			getExistingRemoteAudioTracks: vi.fn(() => []),
		};
		try {
			setupAudioHandler(client as any);
			onSpeaking(true);
			expect(emitSpy).toHaveBeenCalledWith(EVENTS.MEMBER_SPEAKING, {
				room: "lobby",
				domain_uuid: undefined,
				speaking: true,
			});
			onSpeaking(false);
			expect(emitSpy).toHaveBeenLastCalledWith(EVENTS.MEMBER_SPEAKING, {
				room: "lobby",
				domain_uuid: undefined,
				speaking: false,
			});
		} finally {
			cleanupAudioHandler();
			emitSpy.mockRestore();
			useSocketStore.setState({ currentRoom: previousRoom });
		}
	});
});
