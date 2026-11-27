import { beforeEach, describe, expect, it, vi } from "vitest";
import { EVENTS } from "@/socket/events";
import type { SocketEventDeps } from "@/socket/socketEvents";

vi.mock("@/handler_audio", () => ({
	setServerMutedByIdentity: vi.fn(),
}));

type Handler = (data: any) => void;

function createFakeAdapter() {
	const handlers = new Map<string, Handler>();
	return {
		onServerEvent(event: string, handler: Handler) {
			handlers.set(event, handler);
		},
		emit(event: string, data: any) {
			handlers.get(event)?.(data);
		},
		disconnect() {},
	};
}

function fakeDeps(): SocketEventDeps {
	return {
		setRooms: vi.fn(),
		setRoomLayout: vi.fn(),
		setCurrentRoom: vi.fn(),
		setSelectedRoomInfo: vi.fn(),
		setActiveSFUProvider: vi.fn(),
		setConnecting: vi.fn(),
		setConnected: vi.fn(),
		setSpeechRestricted: vi.fn(),
		setSpeechRestrictionInfo: vi.fn(),
		setSpeakingIdentities: vi.fn(),
		currentRoom: () => null,
		selectedRoomInfo: () => null,
		currentDomainUUID: () => null,
		emitActivity: vi.fn(),
		emitPresence: vi.fn(),
		emitKicked: vi.fn(),
		handleProviderChanged: vi.fn(),
		handlePrivateNew: vi.fn(),
		handleMessageCreated: vi.fn(),
		handleAnnouncementNew: vi.fn(),
		currentUserName: () => "",
		currentUserUUID: () => undefined,
	};
}

describe("server mute socket events", () => {
	beforeEach(async () => {
		const { setServerMutedByIdentity } = await import("@/handler_audio");
		vi.mocked(setServerMutedByIdentity).mockClear();
	});

	it("member:muted / member:unmuted drive server mute by identity", async () => {
		const { setServerMutedByIdentity } = await import("@/handler_audio");
		const { bindServerEvents } = await import("@/socket/socketEvents");
		const adapter = createFakeAdapter();
		bindServerEvents(adapter as any, fakeDeps());

		adapter.emit(EVENTS.MEMBER_MUTED, { identity: "alice", muted: true });
		expect(setServerMutedByIdentity).toHaveBeenCalledWith("alice", true);

		adapter.emit(EVENTS.MEMBER_UNMUTED, { identity: "alice", muted: false });
		expect(setServerMutedByIdentity).toHaveBeenCalledWith("alice", false);
	});

	it("ignores events without identity", async () => {
		const { setServerMutedByIdentity } = await import("@/handler_audio");
		const { bindServerEvents } = await import("@/socket/socketEvents");
		const adapter = createFakeAdapter();
		bindServerEvents(adapter as any, fakeDeps());

		adapter.emit(EVENTS.MEMBER_MUTED, {});
		expect(setServerMutedByIdentity).not.toHaveBeenCalled();
	});

	it("member:muted honors payload muted flag", async () => {
		const { setServerMutedByIdentity } = await import("@/handler_audio");
		vi.mocked(setServerMutedByIdentity).mockClear();
		const { bindServerEvents } = await import("@/socket/socketEvents");
		const adapter = createFakeAdapter();
		bindServerEvents(adapter as any, fakeDeps());

		adapter.emit(EVENTS.MEMBER_MUTED, { identity: "bob", muted: false });
		expect(setServerMutedByIdentity).toHaveBeenCalledWith("bob", false);
	});

	it("member:unmuted honors payload muted flag", async () => {
		const { setServerMutedByIdentity } = await import("@/handler_audio");
		vi.mocked(setServerMutedByIdentity).mockClear();
		const { bindServerEvents } = await import("@/socket/socketEvents");
		const adapter = createFakeAdapter();
		bindServerEvents(adapter as any, fakeDeps());

		adapter.emit(EVENTS.MEMBER_UNMUTED, { identity: "bob", muted: true });
		expect(setServerMutedByIdentity).toHaveBeenCalledWith("bob", true);
	});
});

describe("room socket events", () => {
	it("room:left clears current room state and emits room_left", async () => {
		const { bindServerEvents } = await import("@/socket/socketEvents");
		const adapter = createFakeAdapter();
		const deps = fakeDeps();
		deps.currentRoom = () => "lobby";
		bindServerEvents(adapter as any, deps);

		adapter.emit(EVENTS.ROOM_LEFT, {
			room: "lobby",
			domain_uuid: "domain-1",
		});

		expect(deps.setCurrentRoom).toHaveBeenCalledWith(null);
		expect(deps.setSelectedRoomInfo).toHaveBeenCalledWith(null);
		expect(deps.emitActivity).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "room_left",
				room: "lobby",
				domain_uuid: "domain-1",
			}),
		);
	});

	it("room:left for another room does not clear the new room state", async () => {
		const { bindServerEvents } = await import("@/socket/socketEvents");
		const adapter = createFakeAdapter();
		const deps = fakeDeps();
		deps.currentRoom = () => "new-room";
		bindServerEvents(adapter as any, deps);

		adapter.emit(EVENTS.ROOM_LEFT, { room: "old-room" });

		expect(deps.setCurrentRoom).not.toHaveBeenCalled();
		expect(deps.setSelectedRoomInfo).not.toHaveBeenCalled();
		expect(deps.emitActivity).not.toHaveBeenCalled();
	});

	it("room:left for the old room during a switch keeps the new selection", async () => {
		// 切房时旧房 room:left 先于新房 join ack 到达：currentRoom 仍是旧房，
		// 但 selectedRoomInfo 已指向新房。此时不能清空选择，否则切房会被 abort。
		const { bindServerEvents } = await import("@/socket/socketEvents");
		const adapter = createFakeAdapter();
		const deps = fakeDeps();
		deps.currentRoom = () => "old-room";
		deps.selectedRoomInfo = () =>
			({ name: "new-room", domain_uuid: "domain-1" }) as any;
		bindServerEvents(adapter as any, deps);

		adapter.emit(EVENTS.ROOM_LEFT, {
			room: "old-room",
			domain_uuid: "domain-1",
		});

		expect(deps.setCurrentRoom).toHaveBeenCalledWith(null);
		expect(deps.setSelectedRoomInfo).not.toHaveBeenCalled();
		expect(deps.emitActivity).toHaveBeenCalledWith(
			expect.objectContaining({ type: "room_left", room: "old-room" }),
		);
	});

	it("room:left for the selected room still clears the selection", async () => {
		const { bindServerEvents } = await import("@/socket/socketEvents");
		const adapter = createFakeAdapter();
		const deps = fakeDeps();
		deps.currentRoom = () => "lobby";
		deps.selectedRoomInfo = () =>
			({ name: "lobby", domain_uuid: "domain-1" }) as any;
		bindServerEvents(adapter as any, deps);

		adapter.emit(EVENTS.ROOM_LEFT, {
			room: "lobby",
			domain_uuid: "domain-1",
		});

		expect(deps.setCurrentRoom).toHaveBeenCalledWith(null);
		expect(deps.setSelectedRoomInfo).toHaveBeenCalledWith(null);
	});
});

describe("announcement socket events", () => {
	it("announcement:new is forwarded to the deps handler", async () => {
		const { bindServerEvents } = await import("@/socket/socketEvents");
		const adapter = createFakeAdapter();
		const deps = fakeDeps();
		bindServerEvents(adapter as any, deps);

		const payload = {
			uuid: "a-1",
			scope_type: "platform",
			title: "维护公告",
			content: "body",
			level: "info",
			pinned: false,
			created_by_name: "admin",
			is_read: false,
			created_at: Date.now(),
		};
		adapter.emit(EVENTS.ANNOUNCEMENT_NEW, payload);
		expect(deps.handleAnnouncementNew).toHaveBeenCalledWith(payload);
	});
});
