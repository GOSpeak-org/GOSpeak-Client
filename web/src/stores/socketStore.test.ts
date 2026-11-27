import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAdapter, mockTabLock } = vi.hoisted(() => {
	return {
		mockAdapter: {
			isConnected: vi.fn(() => false),
			getCurrentUrl: vi.fn(() => ""),
			getState: vi.fn(() => "new"),
			connect: vi.fn(),
			disconnect: vi.fn(),
			emitFireAndForget: vi.fn(),
			emitAck: vi.fn(() => Promise.resolve({})),
			onServerEvent: vi.fn(() => () => {}),
			offServerEvent: vi.fn(),
			offAllServerEvents: vi.fn(),
			onConnected: vi.fn<(cb: () => void) => () => void>(() => () => {}),
			onDisconnected: vi.fn(() => () => {}),
			onConnectError: vi.fn(() => () => {}),
			onStateChange: vi.fn(
				(_cb: (prev: string, next: string) => void) => () => {},
			),
		},
		mockTabLock: {
			claim: vi.fn(async () => true),
			release: vi.fn(),
			isOwner: vi.fn(() => true),
			ensureListening: vi.fn(),
			setOnForeignClaim: vi.fn(),
		},
	};
});

vi.mock("@/socket/wsClient", () => ({
	createWSClient: () => mockAdapter,
}));

vi.mock("@/api/ws", () => ({
	getWSEndpoint: vi.fn(async () => ({})),
}));

vi.mock("@/socket/tabLock", () => ({
	createTabLock: () => mockTabLock,
}));

vi.mock("@/socket/providerReload", () => ({
	createProviderReloadHandler: () => vi.fn(),
}));

vi.mock("@/components/room/services/loadSfuClient", () => ({
	preloadSfuClient: vi.fn(),
}));

vi.mock("@/stores/chatStore", () => ({
	chatStore: { handlePrivateNew: vi.fn() },
}));

vi.mock("@/stores/userStore", () => ({
	useUserStore: {
		getState: () => ({ user: { id: 1, name: "alice" } }),
		subscribe: vi.fn(),
	},
	default: {
		isLoggedIn: () => true,
		user: () => ({ id: 1, name: "alice" }),
	},
}));

vi.mock("@/stores/domainStore", () => ({
	useDomainStore: {
		getState: () => ({ currentDomainUUID: null }),
		subscribe: vi.fn(),
	},
	default: { state: { currentDomainUUID: null } },
}));

import { EVENTS } from "@/socket/events";
import type { MemberInfo, RoomInfo } from "@/socket/types";
import { socketStore, useSocketStore } from "./socketStore";

const SERVER_EVENT_BINDINGS = 18;

const serverEventHandler = (event: string) => {
	const calls = mockAdapter.onServerEvent.mock.calls as unknown as Array<
		[string, (data: unknown) => void]
	>;
	return calls.find(([name]) => name === event)?.[1];
};

const room = (overrides: Partial<RoomInfo> = {}): RoomInfo => ({
	id: 1,
	uuid: "room-uuid",
	name: "lobby",
	domain_uuid: "domain-a",
	has_password: false,
	limit: 0,
	members: [],
	count: 0,
	...overrides,
});

const member = (overrides: Partial<MemberInfo> = {}): MemberInfo => ({
	id: "u-1",
	identity: "alice-1",
	name: "alice",
	display_name: "Alice",
	avatar: "",
	is_muted: false,
	is_mic_muted: false,
	joined_at: 1,
	...overrides,
});

const onConnectedCb = mockAdapter.onConnected.mock.calls[0]?.[0] as
	| (() => void)
	| undefined;

const onStateChangeCb = mockAdapter.onStateChange.mock.calls[0]?.[0] as
	| ((prev: string, next: string) => void)
	| undefined;

describe("socketStore worker routing", () => {
	beforeEach(() => {
		socketStore.disconnect();
		vi.clearAllMocks();
		mockAdapter.isConnected.mockReturnValue(false);
		mockAdapter.getCurrentUrl.mockReturnValue("");
		mockTabLock.claim.mockResolvedValue(true);
	});

	it("connectToWorker claims the tab lock and connects to worker URL", async () => {
		const url = await socketStore.connectToWorker("wss://worker-a.example");

		expect(url).toBe("wss://worker-a.example");
		expect(mockAdapter.connect).toHaveBeenCalledWith("wss://worker-a.example");
		expect(mockTabLock.claim).toHaveBeenCalledTimes(1);
		expect(mockAdapter.onServerEvent.mock.calls).toHaveLength(
			SERVER_EVENT_BINDINGS,
		);
	});

	it("connectToWorker rejects when another tab owns the lock", async () => {
		mockTabLock.claim.mockResolvedValueOnce(false);

		await expect(
			socketStore.connectToWorker("wss://worker-a.example"),
		).rejects.toThrow("已在其他标签页连接");
		expect(mockAdapter.connect).not.toHaveBeenCalled();
		expect(mockAdapter.onServerEvent).not.toHaveBeenCalled();
	});

	it("connectToWorker binds server events only once", async () => {
		await socketStore.connectToWorker("wss://worker-a.example");
		const boundCount = mockAdapter.onServerEvent.mock.calls.length;
		expect(boundCount).toBe(SERVER_EVENT_BINDINGS);

		onConnectedCb?.();
		await socketStore.connectToWorker("wss://worker-b.example");

		expect(mockAdapter.connect).toHaveBeenCalledTimes(2);
		expect(mockAdapter.onServerEvent.mock.calls.length).toBe(boundCount);
	});

	it("leaveRoom sends explicit domain uuid", async () => {
		await socketStore.leaveRoom("lobby", "domain-a");

		expect(mockAdapter.emitAck).toHaveBeenCalledWith(
			"room:leave",
			expect.objectContaining({ room: "lobby", domain_uuid: "domain-a" }),
		);
	});

	it("socketState follows adapter state machine", () => {
		expect(socketStore.socketState()).toBe("new");
		onStateChangeCb?.("new", "connecting");
		expect(socketStore.socketState()).toBe("connecting");
		onStateChangeCb?.("connecting", "open");
		expect(socketStore.socketState()).toBe("open");
		onStateChangeCb?.("open", "closing");
		expect(socketStore.socketState()).toBe("closing");
	});

	it("clearCurrentRoom clears speaking identities", () => {
		useSocketStore.setState({ speakingIdentities: ["alice"] });
		socketStore.clearCurrentRoom();
		expect(useSocketStore.getState().speakingIdentities).toEqual([]);
	});

	it("disconnect clears speaking identities via resetRoomState", () => {
		useSocketStore.setState({ speakingIdentities: ["alice"] });
		socketStore.disconnect();
		expect(useSocketStore.getState().speakingIdentities).toEqual([]);
	});

	it("disconnect clears the rejoin intent", () => {
		useSocketStore.setState({
			rejoinIntent: { room: "lobby", kind: "text" },
		});
		socketStore.disconnect();
		expect(useSocketStore.getState().rejoinIntent).toBeNull();
	});

	it("clearCurrentRoom revokes the rejoin intent together with currentRoom", () => {
		useSocketStore.setState({
			currentRoom: "lobby",
			rejoinIntent: { room: "lobby", kind: "text" },
		});
		socketStore.clearCurrentRoom();
		expect(useSocketStore.getState().currentRoom).toBeNull();
		expect(useSocketStore.getState().rejoinIntent).toBeNull();
	});

	it("merges a room:updated event through the real reducer into rooms", async () => {
		await socketStore.connectToWorker("wss://worker-a.example");
		const handler = serverEventHandler(EVENTS.ROOM_UPDATED);
		expect(handler).toBeTypeOf("function");

		const bob = member({ id: "u-2", identity: "bob-1", name: "bob" });
		useSocketStore.setState({ rooms: [room({ count: 1 })] });
		handler?.({
			name: "lobby",
			domain_uuid: "domain-a",
			has_password: true,
			members: [bob],
			count: 2,
		});

		const rooms = useSocketStore.getState().rooms;
		expect(rooms).toHaveLength(1);
		expect(rooms[0].has_password).toBe(true);
		expect(rooms[0].count).toBe(2);
		expect(rooms[0].members).toEqual([bob]);
	});

	it("increments the room count through the real member:joined reducer", async () => {
		await socketStore.connectToWorker("wss://worker-a.example");
		const handler = serverEventHandler(EVENTS.MEMBER_JOINED);

		useSocketStore.setState({ rooms: [room({ count: 1 })] });
		handler?.({
			room: "lobby",
			domain_uuid: "domain-a",
			identity: "bob-1",
			id: "u-2",
		});

		expect(useSocketStore.getState().rooms[0].count).toBe(2);
	});

	it("replaces the room list and clears roomsLoading on room:list:result", async () => {
		await socketStore.connectToWorker("wss://worker-a.example");
		const handler = serverEventHandler(EVENTS.ROOM_LIST_RESULT);

		useSocketStore.setState({ rooms: [], roomsLoading: true });
		handler?.({
			rooms: [room({ name: "a" }), room({ name: "b", uuid: "room-b" })],
			count: 2,
		});

		const state = useSocketStore.getState();
		expect(state.rooms.map((r) => r.name)).toEqual(["a", "b"]);
		expect(state.roomsLoading).toBe(false);
	});
});
