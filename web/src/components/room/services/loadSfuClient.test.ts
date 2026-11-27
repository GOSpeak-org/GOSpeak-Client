import { beforeEach, describe, expect, it, vi } from "vitest";

const preloadSFUClient = vi.fn(async () => {});
const createSFUClient = vi.fn(
	async (_provider?: string, _options?: Record<string, unknown>) => ({
		id: "c1",
	}),
);

vi.mock("@gospeak/sfu-client/client", () => ({
	preloadSFUClient,
	createSFUClient,
}));

describe("loadSfuClient", () => {
	beforeEach(() => {
		preloadSFUClient.mockClear();
		createSFUClient.mockClear();
		const store = new Map<string, string>();
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => {
				store.set(key, value);
			},
			removeItem: (key: string) => {
				store.delete(key);
			},
			clear: () => {
				store.clear();
			},
		});
		vi.resetModules();
	});

	it("preloads provider before create", async () => {
		const mod = await import("./loadSfuClient");
		const callOrder: string[] = [];
		preloadSFUClient.mockImplementation(async () => {
			callOrder.push("preload");
		});
		createSFUClient.mockImplementation(
			async (_provider?: string, _options?: Record<string, unknown>) => {
				callOrder.push("create");
				return { id: "c1" };
			},
		);

		await mod.loadSfuClient("livekit");

		expect(preloadSFUClient).toHaveBeenCalledWith("livekit");
		expect(createSFUClient).toHaveBeenCalledWith(
			"livekit",
			expect.objectContaining({ isOnline: expect.any(Function) }),
		);
		expect(callOrder).toEqual(["preload", "create"]);
	});

	it("defaults the online probe to navigator.onLine", async () => {
		const mod = await import("./loadSfuClient");
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

		await mod.loadSfuClient("livekit");

		const options = createSFUClient.mock.calls.at(-1)?.[1] as
			| { isOnline: () => boolean }
			| undefined;
		expect(options?.isOnline()).toBe(false);
	});

	it("lets explicit options override the default probe", async () => {
		const mod = await import("./loadSfuClient");
		const isOnline = () => true;

		await mod.loadSfuClient("livekit", {
			isOnline,
			publishAudio: { dtx: false },
		});

		expect(createSFUClient).toHaveBeenCalledWith("livekit", {
			isOnline,
			publishAudio: { dtx: false },
		});
	});
});
