import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SFUClient } from "@gospeak/sfu-client/types";
import { useScreenShareStore } from "@/stores/screenShareStore";
import { VoiceSessionProvider } from "./VoiceSessionProvider";
import { useWatchScreenShare } from "./useWatchScreenShare";

const mocks = vi.hoisted(() => ({
	sfuClient: {
		getExistingRemoteVideoPublications: vi.fn(
			() => [] as Array<{ identity: string; source: "screen" | "camera" }>,
		),
		onRemoteVideoPublicationChanged: vi.fn(),
		getExistingRemoteVideoTracks: vi.fn(() => []),
		onRemoteVideoTrack: vi.fn(),
		onRemoteVideoTrackRemoved: vi.fn(),
		onLocalScreenShareChanged: vi.fn(),
		setRemoteVideoSubscribed: vi.fn(async () => {}),
	},
	session: { sfuClient: null as SFUClient | null },
}));

vi.mock("./hooks/useVoiceSession", () => ({
	useVoiceSession: () => ({
		sfuClient: mocks.session.sfuClient,
		isJoined: true,
		phase: "ready",
		currentRoom: "room",
		handleManualLeave: vi.fn(),
	}),
}));
vi.mock("./hooks/useRoomAudioBridge", () => ({ useRoomAudioBridge: () => {} }));
vi.mock("./hooks/useRoomSounds", () => ({ useRoomSounds: () => {} }));
vi.mock("./hooks/useMobileSessionBridge", () => ({
	useMobileSessionBridge: () => {},
}));
vi.mock("@/stores/chatStore", () => ({
	useChatStore: Object.assign(() => null, {
		getState: () => ({ textRoom: null }),
	}),
}));
vi.mock("@/stores/socketStore", () => ({
	useSocketStore: Object.assign(() => null, {
		getState: () => ({ selectedRoomInfo: null }),
	}),
}));
vi.mock("@/stores/workspaceUiStore", () => ({
	useWorkspaceUiStore: Object.assign(() => null, {
		getState: () => ({
			stage: "voice",
			showVoice: vi.fn(),
			showText: vi.fn(),
			setChatOpen: vi.fn(),
		}),
	}),
}));

let watch: ReturnType<typeof useWatchScreenShare> | null = null;

function Probe() {
	watch = useWatchScreenShare();
	return null;
}

function w() {
	if (!watch) throw new Error("probe did not mount");
	return watch;
}

function renderProvider() {
	const result = render(
		<VoiceSessionProvider>
			<Probe />
		</VoiceSessionProvider>,
	);
	if (!watch) throw new Error("probe did not mount");
	return result;
}

describe("VoiceSessionProvider video subscription bridge", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		watch = null;
		useScreenShareStore.getState().reset();
		mocks.session.sfuClient = mocks.sfuClient as unknown as SFUClient;
	});

	afterEach(() => {
		cleanup();
	});

	it("seeds publications from getExistingRemoteVideoPublications on mount", () => {
		mocks.sfuClient.getExistingRemoteVideoPublications.mockReturnValue([
			{ identity: "bob", source: "screen" },
		]);
		renderProvider();
		expect(useScreenShareStore.getState().remotePublications).toEqual([
			{ identity: "bob", source: "screen" },
		]);
	});

	it("applies publication changes to the store", () => {
		renderProvider();
		const onChange =
			mocks.sfuClient.onRemoteVideoPublicationChanged.mock.calls[0][0];
		act(() => {
			onChange({ identity: "bob", source: "screen", available: true });
		});
		expect(useScreenShareStore.getState().remotePublications).toEqual([
			{ identity: "bob", source: "screen" },
		]);
		act(() => {
			onChange({ identity: "bob", source: "screen", available: false });
		});
		expect(useScreenShareStore.getState().remotePublications).toEqual([]);
	});

	it("watchScreenShare subscribes the target and unsubscribes the previous active", async () => {
		renderProvider();
		await act(async () => {
			await w().watchScreenShare("alice");
		});
		await act(async () => {
			await w().watchScreenShare("bob");
		});
		expect(mocks.sfuClient.setRemoteVideoSubscribed).toHaveBeenNthCalledWith(
			1,
			"alice",
			"screen",
			true,
		);
		expect(mocks.sfuClient.setRemoteVideoSubscribed).toHaveBeenNthCalledWith(
			2,
			"alice",
			"screen",
			false,
		);
		expect(mocks.sfuClient.setRemoteVideoSubscribed).toHaveBeenNthCalledWith(
			3,
			"bob",
			"screen",
			true,
		);
	});

	it("stopWatchingScreenShare unsubscribes the active and clears it", async () => {
		renderProvider();
		await act(async () => {
			await w().watchScreenShare("bob");
		});
		await act(async () => {
			await w().stopWatchingScreenShare();
		});
		expect(mocks.sfuClient.setRemoteVideoSubscribed).toHaveBeenLastCalledWith(
			"bob",
			"screen",
			false,
		);
		await act(async () => {
			await w().stopWatchingScreenShare();
		});
		expect(mocks.sfuClient.setRemoteVideoSubscribed).toHaveBeenCalledTimes(2);
	});

	it("does not update active state when subscribing throws", async () => {
		mocks.sfuClient.setRemoteVideoSubscribed.mockRejectedValueOnce(
			new Error("subscribe failed"),
		);
		renderProvider();
		await act(async () => {
			await expect(w().watchScreenShare("bob")).rejects.toThrow(
				"subscribe failed",
			);
		});
		await act(async () => {
			await w().stopWatchingScreenShare();
		});
		expect(mocks.sfuClient.setRemoteVideoSubscribed).toHaveBeenCalledTimes(1);
	});

	it("aborts a stale watch when client switches during the unsubscribe await", async () => {
		let resolveUnsubscribe: (() => void) | null = null;
		let unsubscribeCalls = 0;
		const calls: Array<[string, string, boolean]> = [];
		const oldSet = vi.fn(
			(identity: string, source: string, subscribed: boolean) => {
				calls.push([identity, source, subscribed]);
				if (!subscribed && ++unsubscribeCalls === 1) {
					return new Promise<void>((resolve) => {
						resolveUnsubscribe = resolve;
					});
				}
				return Promise.resolve();
			},
		);
		const oldClient = {
			...mocks.sfuClient,
			setRemoteVideoSubscribed: oldSet,
		} as unknown as SFUClient;
		mocks.session.sfuClient = oldClient;
		const { rerender, unmount } = renderProvider();

		await act(async () => {
			await w().watchScreenShare("alice");
		});
		calls.length = 0;
		let watchPromise: Promise<void> | null = null;
		await act(async () => {
			watchPromise = w().watchScreenShare("bob");
		});

		mocks.session.sfuClient = mocks.sfuClient as unknown as SFUClient;
		await act(async () => {
			rerender(
				<VoiceSessionProvider>
					<Probe />
				</VoiceSessionProvider>,
			);
		});
		await act(async () => {
			resolveUnsubscribe?.();
			await watchPromise;
		});

		expect(calls.filter((call) => call[2])).toEqual([]);
		unmount();
	});

	it("does not let a stale client subscription update active after client switch", async () => {
		let resolveOld: (() => void) | null = null;
		const oldSet = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveOld = resolve;
				}),
		);
		const oldClient = {
			...mocks.sfuClient,
			setRemoteVideoSubscribed: oldSet,
		} as unknown as SFUClient;
		mocks.session.sfuClient = oldClient;
		const { rerender, unmount } = renderProvider();

		let watchPromise: Promise<void> | null = null;
		await act(async () => {
			watchPromise = w().watchScreenShare("alice");
		});

		mocks.session.sfuClient = mocks.sfuClient as unknown as SFUClient;
		await act(async () => {
			rerender(
				<VoiceSessionProvider>
					<Probe />
				</VoiceSessionProvider>,
			);
		});
		await act(async () => {
			resolveOld?.();
			await watchPromise;
		});

		await act(async () => {
			await w().stopWatchingScreenShare();
		});
		expect(mocks.sfuClient.setRemoteVideoSubscribed).not.toHaveBeenCalledWith(
			"alice",
			"screen",
			false,
		);
		unmount();
	});

	it("resets the store and unsubscribes active on unmount", async () => {
		const { unmount } = renderProvider();
		await act(async () => {
			await w().watchScreenShare("bob");
		});
		unmount();
		expect(mocks.sfuClient.setRemoteVideoSubscribed).toHaveBeenLastCalledWith(
			"bob",
			"screen",
			false,
		);
		expect(useScreenShareStore.getState().remotePublications).toEqual([]);
	});
});
