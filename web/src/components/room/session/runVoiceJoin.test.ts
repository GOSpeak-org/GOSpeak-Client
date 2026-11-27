import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SFUClient } from "@gospeak/sfu-client/types";
import {
	createVoiceJoinCoordinator,
	runVoiceJoin,
	VoiceJoinAbortError,
	type VoiceJoinResult,
} from "./runVoiceJoin";

const joinResult = (): VoiceJoinResult => ({
	client: {} as unknown as SFUClient,
	provider: "livekit",
});

vi.mock("idb-keyval", () => ({
	get: vi.fn(async () => undefined),
	set: vi.fn(async () => {}),
	del: vi.fn(async () => {}),
}));

function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	label: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => {
			timer = setTimeout(
				() => reject(new Error(`${label}：${ms}ms 未结束`)),
				ms,
			);
		}),
	]).finally(() => {
		if (timer !== undefined) clearTimeout(timer);
	});
}

async function waitFor(
	predicate: () => boolean,
	ms: number,
	label: string,
): Promise<void> {
	const deadline = Date.now() + ms;
	while (!predicate()) {
		if (Date.now() > deadline) {
			throw new Error(`${label}：${ms}ms 未满足`);
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

function makeToken(overrides: Record<string, unknown> = {}) {
	return {
		token: "tok",
		serverUrl: "wss://lk.example",
		room: "r1",
		identity: "alice",
		provider: "livekit" as const,
		...overrides,
	};
}

function makeDeps(overrides: Record<string, unknown> = {}) {
	const phases: string[] = [];
	const order: string[] = [];
	const client = {
		joinRoom: vi.fn(async () => {
			order.push("joinRoom");
		}),
		subscribePeers: vi.fn(),
		leaveRoom: vi.fn(async () => {}),
		destroy: vi.fn(async () => {}),
	};
	const deps = {
		loadClient: vi.fn(async () => {
			order.push("loadClient");
			return client as any;
		}),
		setupAudio: vi.fn(() => {
			order.push("setupAudio");
		}),
		joinSignalRoom: vi.fn(async () => {
			order.push("joinSignalRoom");
		}),
		joinSignalSfu: vi.fn(async () => {
			order.push("joinSignalSfu");
			return { members: [] };
		}),
		onPhase: vi.fn((phase: string) => {
			phases.push(phase);
			order.push(`phase:${phase}`);
		}),
		onClientReady: vi.fn(),
		audioOptions: { audioCapture: { echoCancellation: true } },
		socket: {
			isConnected: () => true,
			emitAck: vi.fn(),
			emitFireAndForget: vi.fn(),
			onServerEvent: vi.fn(),
			onDisconnected: vi.fn(),
		},
		password: "pwd",
		...overrides,
	};
	return { deps, client, phases, order };
}

describe("runVoiceJoin", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("connects to workerUrl before signal join", async () => {
		const connectSignal = vi.fn(async () => {});
		const { deps } = makeDeps({ connectSignal });
		await runVoiceJoin(
			makeToken({ workerUrl: "wss://worker-a.example" }) as any,
			deps as any,
		);
		expect(connectSignal).toHaveBeenCalledWith("wss://worker-a.example");
		expect(deps.joinSignalRoom).toHaveBeenCalled();
	});

	it("rejoins previous text room after switching worker", async () => {
		const connectSignal = vi.fn(async () => {});
		const rejoinTextRoom = vi.fn(async () => {});
		const { deps } = makeDeps({
			connectSignal,
			getCurrentRoom: () => ({
				room: "lobby",
				domain_uuid: "domain-a",
				type: "text",
			}),
			rejoinTextRoom,
		});
		await runVoiceJoin(
			makeToken({
				workerUrl: "wss://worker-a.example",
				room: "r1",
				domain_uuid: "domain-a",
			}) as any,
			deps as any,
		);
		expect(connectSignal).toHaveBeenCalledWith("wss://worker-a.example");
		expect(rejoinTextRoom).toHaveBeenCalledWith("lobby", "domain-a");
		expect(deps.joinSignalRoom.mock.invocationCallOrder[0]).toBeGreaterThan(
			rejoinTextRoom.mock.invocationCallOrder[0],
		);
	});

	it("uses sfuRoom for media join while signal keeps logical room + domain_uuid", async () => {
		const { deps, client } = makeDeps();
		const token = makeToken({
			sfuRoom: "domain-a:r1",
			domain_uuid: "domain-a",
		});
		await runVoiceJoin(token as any, deps as any);

		expect(client.joinRoom).toHaveBeenCalledWith({
			token: "tok",
			serverUrl: "wss://lk.example",
			identity: "alice",
			room: "domain-a:r1",
			stream: undefined,
			streamToken: undefined,
		});
		expect(deps.joinSignalRoom).toHaveBeenCalledWith("r1", "pwd", "domain-a");
		expect(deps.joinSignalSfu).toHaveBeenCalledWith(
			"r1",
			undefined,
			"domain-a",
		);
	});

	it("livekit awaits signal after media (no media_ready early return)", async () => {
		const { deps, client, phases, order } = makeDeps();
		const token = makeToken();
		const result = await runVoiceJoin(token as any, deps as any);

		expect(result.client).toBe(client);
		expect(result.provider).toBe("livekit");
		expect(phases).toEqual(["loading_sfu", "joining_media", "joining_signal"]);
		expect(order).toEqual([
			"phase:loading_sfu",
			"loadClient",
			"phase:joining_media",
			"joinRoom",
			"setupAudio",
			"phase:joining_signal",
			"joinSignalRoom",
			"joinSignalSfu",
		]);
		expect(deps.loadClient).toHaveBeenCalledWith("livekit", {
			audioCapture: { echoCancellation: true },
			socket: {
				isConnected: expect.any(Function),
				emitAck: expect.any(Function),
				emitFireAndForget: expect.any(Function),
				onServerEvent: expect.any(Function),
				onDisconnected: expect.any(Function),
			},
		});
		expect(client.joinRoom).toHaveBeenCalledWith({
			token: "tok",
			serverUrl: "wss://lk.example",
			identity: "alice",
			room: "r1",
			stream: undefined,
			streamToken: undefined,
		});
		expect(deps.setupAudio).toHaveBeenCalledWith(client);
		expect(deps.joinSignalRoom).toHaveBeenCalledWith("r1", "pwd", undefined);
		expect(deps.joinSignalSfu).toHaveBeenCalledWith("r1", undefined, undefined);
	});

	it("livekit does not serialize concurrent joins", async () => {
		let active = 0;
		let maxActive = 0;
		const entered: string[] = [];
		let releaseJoins!: () => void;
		const gate = new Promise<void>((resolve) => {
			releaseJoins = resolve;
		});
		const joinRoom = vi.fn(async (opts: { room?: string }) => {
			active += 1;
			maxActive = Math.max(maxActive, active);
			entered.push(opts.room ?? "");
			await gate;
			active -= 1;
		});
		const { deps } = makeDeps({
			loadClient: vi.fn(
				async () =>
					({
						joinRoom,
						subscribePeers: vi.fn(),
						leaveRoom: vi.fn(async () => {}),
						destroy: vi.fn(async () => {}),
					}) as any,
			),
			coordinator: createVoiceJoinCoordinator(),
		});

		const first = runVoiceJoin(makeToken({ room: "r1" }) as any, deps as any);
		const second = runVoiceJoin(makeToken({ room: "r2" }) as any, deps as any);

		await waitFor(
			() => active === 2,
			2000,
			"两个不同 joinKey 未能并发进入 joinRoom",
		);
		expect(entered.slice().sort()).toEqual(["r1", "r2"]);
		expect(maxActive).toBe(2);

		releaseJoins();
		await withTimeout(
			Promise.all([first, second]),
			2000,
			"并发 join 未在超时前返回",
		);
	});

	it("切房时旧会话拆除与新房 join 并行，不等待旧会话", async () => {
		let releaseTeardown!: () => void;
		const teardownGate = new Promise<void>((resolve) => {
			releaseTeardown = resolve;
		});
		const teardownPrevious = vi.fn(() => teardownGate);
		const { deps, order } = makeDeps({ teardownPrevious });

		const pending = runVoiceJoin(makeToken({ room: "r2" }) as any, deps as any);

		await waitFor(
			() => order.includes("joinSignalSfu"),
			2000,
			"新房 join 被旧会话拆除阻塞",
		);
		expect(teardownPrevious).toHaveBeenCalledTimes(1);
		expect(teardownPrevious.mock.invocationCallOrder[0]).toBeLessThan(
			deps.loadClient.mock.invocationCallOrder[0],
		);

		releaseTeardown();
		const result = await withTimeout(pending, 2000, "新房 join 未在超时前返回");
		expect(result.provider).toBe("livekit");
		expect(order).toContain("joinRoom");
	});

	it("aborts before side effects when signal already aborted", async () => {
		const controller = new AbortController();
		controller.abort();
		const { deps } = makeDeps({ signal: controller.signal });

		await expect(
			runVoiceJoin(makeToken() as any, deps as any),
		).rejects.toBeInstanceOf(VoiceJoinAbortError);

		expect(deps.loadClient).not.toHaveBeenCalled();
		expect(deps.onPhase).not.toHaveBeenCalled();
		expect(deps.setupAudio).not.toHaveBeenCalled();
		expect(deps.joinSignalRoom).not.toHaveBeenCalled();
		expect(deps.joinSignalSfu).not.toHaveBeenCalled();
	});

	it("tears down client when aborted after media join starts", async () => {
		const controller = new AbortController();
		const leaveRoom = vi.fn(async () => {});
		const destroy = vi.fn(async () => {});
		const { deps, client } = makeDeps({
			signal: controller.signal,
			loadClient: vi.fn(async () => {
				return {
					...client,
					joinRoom: vi.fn(async () => {
						controller.abort();
						await new Promise((r) => setTimeout(r, 0));
					}),
					leaveRoom,
					destroy,
				} as any;
			}),
		});

		await expect(
			runVoiceJoin(makeToken() as any, deps as any),
		).rejects.toBeInstanceOf(VoiceJoinAbortError);

		expect(leaveRoom).toHaveBeenCalled();
		expect(destroy).toHaveBeenCalled();
		expect(deps.joinSignalRoom).not.toHaveBeenCalled();
	});
});

describe("createVoiceJoinCoordinator", () => {
	it("reuses the in-flight promise for the same key", async () => {
		const coordinator = createVoiceJoinCoordinator();
		let executions = 0;
		const join = () => {
			executions += 1;
			return new Promise<VoiceJoinResult>((resolve) => {
				setTimeout(() => resolve(joinResult()), 10);
			});
		};
		const p1 = coordinator.run("k", join);
		const p2 = coordinator.run("k", join);
		const [r1, r2] = await Promise.all([p1, p2]);
		expect(executions).toBe(1);
		expect(r2).toBe(r1);
	});

	it("different keys run independently", async () => {
		const coordinator = createVoiceJoinCoordinator();
		let executions = 0;
		const join = async (): Promise<VoiceJoinResult> => {
			executions += 1;
			return joinResult();
		};
		await Promise.all([
			coordinator.run("k1", join),
			coordinator.run("k2", join),
		]);
		expect(executions).toBe(2);
	});

	it("a settled join is removed so a later call runs again", async () => {
		const coordinator = createVoiceJoinCoordinator();
		let executions = 0;
		const join = async (): Promise<VoiceJoinResult> => {
			executions += 1;
			return joinResult();
		};
		await coordinator.run("k", join);
		await coordinator.run("k", join);
		expect(executions).toBe(2);
	});

	it("a failed join is removed so a later call can retry", async () => {
		const coordinator = createVoiceJoinCoordinator();
		let executions = 0;
		const join = async (): Promise<VoiceJoinResult> => {
			executions += 1;
			if (executions === 1) throw new Error("boom");
			return joinResult();
		};
		await expect(coordinator.run("k", join)).rejects.toThrow("boom");
		await expect(coordinator.run("k", join)).resolves.toEqual(joinResult());
		expect(executions).toBe(2);
	});
});
