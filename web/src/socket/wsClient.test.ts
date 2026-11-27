import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MockWebSocket {
	static instances: MockWebSocket[] = [];
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;

	url: string;
	protocols: string[];
	readyState = MockWebSocket.CONNECTING;
	onopen: (() => void) | null = null;
	onmessage: ((ev: MessageEvent) => void) | null = null;
	onclose: ((ev: CloseEvent) => void) | null = null;
	onerror: (() => void) | null = null;

	constructor(url: string, protocols?: string[]) {
		this.url = url;
		this.protocols = protocols ?? [];
		MockWebSocket.instances.push(this);
	}

	send() {}

	close() {
		this.readyState = MockWebSocket.CLOSED;
		this.onclose?.({ reason: "closed" } as CloseEvent);
	}
}

describe("wsClient", () => {
	beforeEach(() => {
		MockWebSocket.instances = [];
		vi.stubGlobal("WebSocket", MockWebSocket);
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		MockWebSocket.instances = [];
	});

	it("emitFireAndForget reports whether the event was actually sent", async () => {
		const { createWSClient } = await import("./wsClient");
		const client = createWSClient();

		expect(client.emitFireAndForget("room:create", {})).toBe(false);

		client.connect("ws://example.test/ws");
		const ws = MockWebSocket.instances[0];
		ws.readyState = MockWebSocket.OPEN;
		ws.onopen?.();
		expect(client.emitFireAndForget("room:create", {})).toBe(true);

		client.disconnect();
	});

	it("preserves existing query params when connecting", async () => {
		const { createWSClient } = await import("./wsClient");
		const client = createWSClient();

		client.connect("https://voice.example.com/ws?region=eu");
		expect(MockWebSocket.instances[0].url).toBe(
			"wss://voice.example.com/ws?region=eu",
		);

		client.disconnect();
	});

	it("appends /ws while preserving existing query params", async () => {
		const { createWSClient } = await import("./wsClient");
		const client = createWSClient();

		client.connect("https://voice.example.com?region=eu");
		expect(MockWebSocket.instances[0].url).toBe(
			"wss://voice.example.com/ws?region=eu",
		);

		client.disconnect();
	});

	it("re-resolves the ws endpoint before automatic reconnect", async () => {
		const { createWSClient } = await import("./wsClient");
		const refreshEndpoint = vi.fn().mockResolvedValue({});
		const client = createWSClient({ refreshEndpoint });

		client.connect("ws://example.test/ws");
		expect(MockWebSocket.instances).toHaveLength(1);
		const first = MockWebSocket.instances[0];
		first.onclose?.({ reason: "network lost" } as CloseEvent);

		await vi.advanceTimersByTimeAsync(4000);

		expect(refreshEndpoint).toHaveBeenCalledTimes(1);
		expect(MockWebSocket.instances).toHaveLength(2);
		expect(MockWebSocket.instances[1].protocols).toEqual(["gospeak"]);

		client.disconnect();
	});

	it("re-resolves the ws endpoint URL on reconnect", async () => {
		const { createWSClient } = await import("./wsClient");
		const refreshEndpoint = vi.fn().mockResolvedValue({
			url: "wss://new-worker/ws",
		});
		const client = createWSClient({ refreshEndpoint });

		client.connect("wss://old-worker/ws");
		expect(MockWebSocket.instances[0].url).toBe("wss://old-worker/ws");
		MockWebSocket.instances[0].onclose?.({
			reason: "worker changed",
		} as CloseEvent);

		await vi.advanceTimersByTimeAsync(4000);

		expect(refreshEndpoint).toHaveBeenCalledTimes(1);
		expect(MockWebSocket.instances).toHaveLength(2);
		expect(MockWebSocket.instances[1].url).toBe("wss://new-worker/ws");
		expect(client.getCurrentUrl()).not.toContain("old-worker");

		client.disconnect();
	});

	it("exposes explicit connection state transitions", async () => {
		const { createWSClient } = await import("./wsClient");
		const client = createWSClient();
		const transitions: Array<[string, string]> = [];
		client.onStateChange((prev, next) => transitions.push([prev, next]));

		expect(client.getState()).toBe("new");

		client.connect("ws://example.test/ws");
		expect(client.getState()).toBe("connecting");

		const ws = MockWebSocket.instances[0];
		ws.readyState = MockWebSocket.OPEN;
		ws.onopen?.();
		expect(client.getState()).toBe("open");
		expect(transitions).toContainEqual(["new", "connecting"]);
		expect(transitions).toContainEqual(["connecting", "open"]);

		client.disconnect();
		expect(client.getState()).toBe("closed");
		expect(transitions).toContainEqual(["closing", "closed"]);
	});

	it("rejects emitAck until the transport readyState is OPEN", async () => {
		const { createWSClient } = await import("./wsClient");
		const client = createWSClient();
		client.connect("ws://example.test/ws");
		const ws = MockWebSocket.instances[0];

		await expect(client.emitAck("room:create", {})).rejects.toThrow(
			"socket not connected",
		);

		const early = client.emitAck("room:create", {});
		ws.onopen?.();
		expect(client.getState()).toBe("open");
		expect(ws.readyState).toBe(MockWebSocket.CONNECTING);
		await expect(early).rejects.toThrow("socket not connected");

		ws.readyState = MockWebSocket.OPEN;
		const sent = client.emitAck("room:create", {});
		ws.onmessage?.(
			new MessageEvent("message", {
				data: JSON.stringify({
					event: "room:created",
					id: "1",
					data: { ok: true },
				}),
			}),
		);
		await expect(sent).resolves.toEqual({ ok: true });

		client.disconnect();
	});

	it("allows closed state to reconnect but rejects backward transitions", async () => {
		const { createWSClient } = await import("./wsClient");
		const client = createWSClient();
		const transitions: Array<[string, string]> = [];
		client.onStateChange((prev, next) => transitions.push([prev, next]));

		client.connect("ws://example.test/ws");
		const first = MockWebSocket.instances[0];
		first.readyState = MockWebSocket.OPEN;
		first.onopen?.();
		first.onclose?.({ reason: "network lost" } as CloseEvent);
		expect(client.getState()).toBe("closed");

		client.connect("ws://example.test/ws");
		expect(client.getState()).toBe("connecting");
		const second = MockWebSocket.instances[1];
		second.readyState = MockWebSocket.OPEN;
		second.onopen?.();
		expect(client.getState()).toBe("open");

		client.disconnect();
		expect(client.getState()).toBe("closed");
		client.disconnect();
		expect(client.getState()).toBe("closed");
		expect(transitions).not.toContainEqual(["closed", "closing"]);
	});

	it("holds reconnection while the browser is offline and resumes the moment it is back", async () => {
		const { createWSClient } = await import("./wsClient");
		let online = false;
		const refreshEndpoint = vi.fn().mockResolvedValue({});
		const client = createWSClient({ refreshEndpoint, isOnline: () => online });

		client.connect("ws://example.test/ws");
		MockWebSocket.instances[0].onclose?.({ reason: "offline" } as CloseEvent);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(MockWebSocket.instances).toHaveLength(1);

		online = true;
		window.dispatchEvent(new Event("online"));
		await vi.advanceTimersByTimeAsync(0);

		expect(MockWebSocket.instances).toHaveLength(2);

		client.disconnect();
	});

	it("cancels a pending backoff timer when the browser goes offline", async () => {
		const { createWSClient } = await import("./wsClient");
		let online = true;
		const client = createWSClient({ isOnline: () => online });

		client.connect("ws://example.test/ws");
		MockWebSocket.instances[0].onclose?.({
			reason: "network lost",
		} as CloseEvent);

		online = false;
		window.dispatchEvent(new Event("offline"));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(MockWebSocket.instances).toHaveLength(1);

		online = true;
		window.dispatchEvent(new Event("online"));
		await vi.advanceTimersByTimeAsync(0);
		expect(MockWebSocket.instances).toHaveLength(2);

		client.disconnect();
	});

	it("does not reconnect after an explicit disconnect even if the network returns", async () => {
		const { createWSClient } = await import("./wsClient");
		let online = true;
		const client = createWSClient({ isOnline: () => online });

		client.connect("ws://example.test/ws");
		client.disconnect();

		online = true;
		window.dispatchEvent(new Event("online"));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(MockWebSocket.instances).toHaveLength(1);
	});
});
