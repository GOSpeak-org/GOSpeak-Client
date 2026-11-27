import { describe, expect, it } from "vitest";
import {
	getVoiceProviderAdapter,
	resolveConnectTarget,
	resolveLivekitConnectTarget,
} from "./providers";

describe("getVoiceProviderAdapter", () => {
	it("livekit awaits signal and does not serialize joins", () => {
		const livekit = getVoiceProviderAdapter("livekit");
		expect(livekit.provider).toBe("livekit");
		expect(livekit.interactiveAfterMedia).toBeFalsy();
		expect(livekit.signalJoinMode).toBe("await");
		expect(livekit.serializeJoins).toBe(false);
		expect(livekit.afterMediaJoin).toBeUndefined();
	});

	it("resolveConnectTarget returns serverUrl for livekit", () => {
		expect(
			resolveConnectTarget("livekit", {
				token: "t",
				serverUrl: "wss://lk.example",
				room: "r1",
				identity: "alice",
			}),
		).toBe("wss://lk.example");
	});

	it("falls back to livekit adapter for unknown providers", () => {
		const adapter = getVoiceProviderAdapter("unknown" as never);
		expect(adapter.provider).toBe("livekit");
	});
});

describe("resolveLivekitConnectTarget", () => {
	it("routes a public LiveKit URL through the same-origin loopback proxy", () => {
		expect(
			resolveLivekitConnectTarget(
				"wss://gospeak.example.com/livekit",
				"http://localhost:47900/domain/abc",
			),
		).toBe("ws://localhost:47900/livekit");
	});

	it("keeps wss when the loopback page is https", () => {
		expect(
			resolveLivekitConnectTarget(
				"wss://gospeak.example.com/livekit",
				"https://localhost:47900/domain/abc",
			),
		).toBe("wss://localhost:47900/livekit");
	});

	it("leaves an already same-origin URL untouched", () => {
		expect(
			resolveLivekitConnectTarget(
				"ws://127.0.0.1:47900/livekit",
				"http://127.0.0.1:47900/domain/abc",
			),
		).toBe("ws://127.0.0.1:47900/livekit");
	});

	it("does not rewrite on a public web origin", () => {
		expect(
			resolveLivekitConnectTarget(
				"wss://gospeak.example.com/livekit",
				"https://gospeak.example.com/domain/abc",
			),
		).toBe("wss://gospeak.example.com/livekit");
	});

	it("does not rewrite non-/livekit targets", () => {
		expect(
			resolveLivekitConnectTarget(
				"wss://lk.example/other",
				"http://localhost:47900/",
			),
		).toBe("wss://lk.example/other");
	});
});
