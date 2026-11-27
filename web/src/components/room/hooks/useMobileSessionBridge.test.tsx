import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMobileSessionBridge } from "./useMobileSessionBridge";

const m = vi.hoisted(() => ({
	activate: vi.fn(async () => {}),
	deactivate: vi.fn(async () => {}),
	setMetadata: vi.fn(async () => {}),
	clear: vi.fn(async () => {}),
	onAction: vi.fn((_handler: (action: string) => void) => () => {}),
	onStateChange: vi.fn((_handler: (state: string) => void) => () => {}),
	notify: vi.fn(
		async (_options: { id: number; title: string; body: string }) => {},
	),
	cancel: vi.fn(async (_id: number) => {}),
	requestPermission: vi.fn(async () => {}),
	onRoomKicked: vi.fn((_handler: () => void) => () => {}),
	setIsInputMute: vi.fn((_value: boolean) => {}),
	connected: vi.fn(() => true),
	connect: vi.fn(() => {}),
	selectedRoomInfo: vi.fn(() => ({ name: "lobby" })),
}));

vi.mock("@gospeak/mobile-capabilities", () => ({
	inMobile: () => true,
	createMobile: () => ({
		audioSession: { activate: m.activate, deactivate: m.deactivate },
		mediaControl: {
			setMetadata: m.setMetadata,
			clear: m.clear,
			onAction: m.onAction,
		},
		lifecycle: { onStateChange: m.onStateChange },
		localNotification: {
			requestPermission: m.requestPermission,
			notify: m.notify,
			cancel: m.cancel,
		},
	}),
}));

vi.mock("@/stores/socketStore", () => ({
	socketStore: {
		connected: m.connected,
		connect: m.connect,
		selectedRoomInfo: m.selectedRoomInfo,
		onRoomKicked: m.onRoomKicked,
	},
}));

vi.mock("@/stores/voiceChatStore", () => ({
	useVoiceChatActions: () => ({ setIsInputMute: m.setIsInputMute }),
	useVoiceChatStore: (selector: (state: { isInputMute: boolean }) => unknown) =>
		selector({ isInputMute: false }),
}));

const baseInput = {
	isJoined: false,
	currentRoom: null as string | null,
	phase: "idle" as const,
	handleManualLeave: () => {},
};

describe("useMobileSessionBridge", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		m.connected.mockReturnValue(true);
		m.selectedRoomInfo.mockReturnValue({ name: "lobby" });
	});

	it("activates the audio session only while joined", () => {
		const { rerender, unmount } = renderHook(
			({ props }: { props: typeof baseInput }) => useMobileSessionBridge(props),
			{ initialProps: { props: baseInput } },
		);
		expect(m.activate).not.toHaveBeenCalled();
		rerender({ props: { ...baseInput, isJoined: true } });
		expect(m.activate).toHaveBeenCalledTimes(1);
		unmount();
		expect(m.deactivate).toHaveBeenCalledTimes(1);
	});

	it("publishes room metadata to the lock screen", () => {
		renderHook(() =>
			useMobileSessionBridge({
				...baseInput,
				isJoined: true,
				currentRoom: "lobby",
			}),
		);
		expect(m.setMetadata).toHaveBeenCalledWith({
			title: "lobby",
			subtitle: "GOSpeak 语音房间",
			muted: false,
		});
	});

	it("maps lock-screen actions to mute and hangup", () => {
		const handleManualLeave = vi.fn();
		renderHook(() =>
			useMobileSessionBridge({ ...baseInput, handleManualLeave }),
		);
		const handler = m.onAction.mock.calls[0]?.[0] as (action: string) => void;
		act(() => handler("mute"));
		expect(m.setIsInputMute).toHaveBeenCalledWith(true);
		act(() => handler("unmute"));
		expect(m.setIsInputMute).toHaveBeenCalledWith(false);
		act(() => handler("hangup"));
		expect(handleManualLeave).toHaveBeenCalledTimes(1);
	});

	it("reconnects signaling when the app returns while disconnected", () => {
		m.connected.mockReturnValue(false);
		renderHook(() => useMobileSessionBridge(baseInput));
		const handler = m.onStateChange.mock.calls[0]?.[0] as (
			state: string,
		) => void;
		act(() => handler("active"));
		expect(m.connect).toHaveBeenCalledTimes(1);
		expect(m.activate).toHaveBeenCalledTimes(1);
	});

	it("notifies locally when kicked from a room", () => {
		renderHook(() => useMobileSessionBridge(baseInput));
		const handler = m.onRoomKicked.mock.calls[0]?.[0] as () => void;
		act(() => handler());
		expect(m.notify).toHaveBeenCalledWith({
			id: 2001,
			title: "GOSpeak",
			body: "你已被移出房间",
		});
	});

	it("notifies locally when the voice session fails", () => {
		renderHook(() => useMobileSessionBridge({ ...baseInput, phase: "failed" }));
		expect(m.notify).toHaveBeenCalledWith({
			id: 2002,
			title: "语音连接已断开",
			body: "返回房间可重新连接",
		});
	});
});
