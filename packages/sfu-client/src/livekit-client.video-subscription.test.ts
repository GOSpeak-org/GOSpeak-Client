import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (...args: any[]) => void;

const rooms: Array<{
	options: Record<string, any>;
	handlers: Map<string, Handler[]>;
	emit: (event: string, ...args: any[]) => void;
	connect: ReturnType<typeof vi.fn>;
	remoteParticipants: Map<
		string,
		{
			videoTrackPublications: Map<string, any>;
			audioTrackPublications: Map<string, any>;
		}
	>;
}> = [];

vi.mock("livekit-client", () => {
	class Room {
		options: Record<string, any>;
		handlers = new Map<string, Handler[]>();
		state = "connected";
		connect = vi.fn(async () => {});
		prepareConnection = vi.fn(async () => {});
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
			rooms.push(this as never);
		}
		on(event: string, handler: Handler) {
			const existing = this.handlers.get(event) ?? [];
			existing.push(handler);
			this.handlers.set(event, existing);
			return this;
		}
		emit(event: string, ...args: any[]) {
			for (const handler of this.handlers.get(event) ?? []) handler(...args);
		}
		removeAllListeners() {
			this.handlers.clear();
		}
		async disconnect() {}
	}
	return {
		Room,
		RoomEvent: {
			Disconnected: "disconnected",
			Reconnecting: "reconnecting",
			Reconnected: "reconnected",
			ActiveSpeakersChanged: "activeSpeakersChanged",
			TrackPublished: "trackPublished",
			TrackUnpublished: "trackUnpublished",
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
			Source: { ScreenShare: "screen_share", Camera: "camera" },
		},
		VideoPresets: { h720: { resolution: { width: 1280, height: 720 } } },
	};
});

describe("LiveKit remote video on-demand subscription", () => {
	beforeEach(() => {
		rooms.length = 0;
	});

	it("joins with autoSubscribe disabled, auto-subscribes audio and registers video without subscribing", async () => {
		const { LiveKitSFUClient } = await import("./livekit-client");
		const client = new LiveKitSFUClient();
		const room = rooms[0];

		await client.joinRoom({
			token: "token",
			serverUrl: "wss://sfu.example",
			identity: "local",
		});

		expect(room.connect).toHaveBeenCalledWith("wss://sfu.example", "token", {
			autoSubscribe: false,
		});

		const audioSetSubscribed = vi.fn();
		const videoSetSubscribed = vi.fn();
		const audioPublication = {
			kind: "audio",
			source: "microphone",
			setSubscribed: audioSetSubscribed,
		};
		const videoPublication = {
			kind: "video",
			source: "screen_share",
			setSubscribed: videoSetSubscribed,
		};
		const participant = { identity: "remote-user" };

		room.emit("trackPublished", audioPublication, participant);
		room.emit("trackPublished", videoPublication, participant);

		expect(audioSetSubscribed).toHaveBeenCalledWith(true);
		expect(videoSetSubscribed).not.toHaveBeenCalled();
	});

	it("subscribes only the selected video publication by identity and source", async () => {
		const { LiveKitSFUClient } = await import("./livekit-client");
		const client = new LiveKitSFUClient();
		const room = rooms[0];

		await client.joinRoom({
			token: "token",
			serverUrl: "wss://sfu.example",
			identity: "local",
		});

		const screenSetSubscribed = vi.fn();
		const cameraSetSubscribed = vi.fn();
		const screenPublication = {
			kind: "video",
			source: "screen_share",
			setSubscribed: screenSetSubscribed,
		};
		const cameraPublication = {
			kind: "video",
			source: "camera",
			setSubscribed: cameraSetSubscribed,
		};
		const participant = { identity: "bob" };

		room.emit("trackPublished", screenPublication, participant);
		room.emit("trackPublished", cameraPublication, participant);

		await client.setRemoteVideoSubscribed?.("bob", "screen", true);

		expect(screenSetSubscribed).toHaveBeenCalledWith(true);
		expect(cameraSetSubscribed).not.toHaveBeenCalled();

		await client.setRemoteVideoSubscribed?.("bob", "screen", false);

		expect(screenSetSubscribed).toHaveBeenLastCalledWith(false);
		expect(cameraSetSubscribed).not.toHaveBeenCalled();
	});

	it("notifies availability false when a video publication is unpublished", async () => {
		const { LiveKitSFUClient } = await import("./livekit-client");
		const client = new LiveKitSFUClient();
		const room = rooms[0];

		await client.joinRoom({
			token: "token",
			serverUrl: "wss://sfu.example",
			identity: "local",
		});

		const changed = vi.fn();
		client.onRemoteVideoPublicationChanged?.(changed);

		const publication = {
			kind: "video",
			source: "screen_share",
			setSubscribed: vi.fn(),
		};
		const participant = { identity: "bob" };

		room.emit("trackPublished", publication, participant);
		expect(changed).toHaveBeenLastCalledWith({
			identity: "bob",
			source: "screen",
			available: true,
		});

		room.emit("trackUnpublished", publication, participant);
		expect(changed).toHaveBeenLastCalledWith({
			identity: "bob",
			source: "screen",
			available: false,
		});
	});

	it("subscribes to audio publications that existed before join", async () => {
		const { LiveKitSFUClient } = await import("./livekit-client");
		const audioSetSubscribed = vi.fn();
		const client = new LiveKitSFUClient();
		const room = rooms[0];
		room.remoteParticipants.set("alice", {
			audioTrackPublications: new Map([
				[
					"mic",
					{
						kind: "audio",
						source: "microphone",
						setSubscribed: audioSetSubscribed,
					},
				],
			]),
			videoTrackPublications: new Map(),
		} as never);

		await client.joinRoom({
			token: "token",
			serverUrl: "wss://sfu.example",
			identity: "local",
		});

		expect(audioSetSubscribed).toHaveBeenCalledWith(true);
	});

	it("subscribes to a pre-existing screen publication after seeding existing publications", async () => {
		const { LiveKitSFUClient } = await import("./livekit-client");
		const client = new LiveKitSFUClient();
		const room = rooms[0];

		await client.joinRoom({
			token: "token",
			serverUrl: "wss://sfu.example",
			identity: "local",
		});

		const screenSetSubscribed = vi.fn();
		const screenPublication = {
			kind: "video",
			source: "screen_share",
			setSubscribed: screenSetSubscribed,
		};
		room.remoteParticipants.set("bob", {
			identity: "bob",
			audioTrackPublications: new Map(),
			videoTrackPublications: new Map([["screen", screenPublication]]),
		} as never);

		expect(client.getExistingRemoteVideoPublications?.()).toEqual([
			{ identity: "bob", source: "screen" },
		]);
		await client.setRemoteVideoSubscribed?.("bob", "screen", true);

		expect(screenSetSubscribed).toHaveBeenCalledWith(true);
	});

	it("returns existing video publications regardless of subscription state", async () => {
		const { LiveKitSFUClient } = await import("./livekit-client");
		const client = new LiveKitSFUClient();
		const room = rooms[0];

		await client.joinRoom({
			token: "token",
			serverUrl: "wss://sfu.example",
			identity: "local",
		});

		const screenPublication = {
			kind: "video",
			source: "screen_share",
			setSubscribed: vi.fn(),
		};
		const cameraPublication = {
			kind: "video",
			source: "camera",
			setSubscribed: vi.fn(),
		};
		const participant = {
			identity: "bob",
			videoTrackPublications: new Map([
				["screen", screenPublication],
				["camera", cameraPublication],
			]),
		};
		room.remoteParticipants.set("bob", participant as never);

		expect(client.getExistingRemoteVideoPublications?.()).toEqual([
			{ identity: "bob", source: "screen" },
			{ identity: "bob", source: "camera" },
		]);
	});
});
