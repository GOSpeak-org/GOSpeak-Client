import type {
	RemoteVideoPublicationInfo,
	RemoteVideoTrackInfo,
	RemoteVideoTrackLike,
} from "@gospeak/sfu-client/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useScreenShareStore } from "./screenShareStore";

function makeTrack(): RemoteVideoTrackLike {
	return { attach: () => {}, detach: () => [] };
}

function makeRemote(
	identity: string,
	source: RemoteVideoTrackInfo["source"] = "screen",
): RemoteVideoTrackInfo {
	return { identity, source, track: makeTrack() };
}

function makePublication(
	identity: string,
	source: RemoteVideoPublicationInfo["source"] = "screen",
): RemoteVideoPublicationInfo {
	return { identity, source };
}

describe("screenShareStore", () => {
	beforeEach(() => {
		useScreenShareStore.getState().reset();
	});

	it("replacePublications only changes publications, leaving remote untouched", () => {
		const remote = makeRemote("alice");
		useScreenShareStore.getState().upsertRemote(remote);
		useScreenShareStore
			.getState()
			.replacePublications([makePublication("bob"), makePublication("carol")]);

		const state = useScreenShareStore.getState();
		expect(state.remote).toEqual([remote]);
		expect(state.remotePublications).toEqual([
			makePublication("bob"),
			makePublication("carol"),
		]);
	});

	it("upsertPublication removes the matching publication when unavailable", () => {
		useScreenShareStore
			.getState()
			.replacePublications([makePublication("alice"), makePublication("bob")]);

		useScreenShareStore.getState().upsertPublication({
			...makePublication("alice"),
			available: false,
		});

		expect(useScreenShareStore.getState().remotePublications).toEqual([
			makePublication("bob"),
		]);
	});

	it("upsertPublication adds available publications and replaces duplicates", () => {
		useScreenShareStore
			.getState()
			.replacePublications([makePublication("alice")]);

		useScreenShareStore.getState().upsertPublication({
			...makePublication("alice"),
			available: true,
		});
		useScreenShareStore.getState().upsertPublication({
			...makePublication("bob"),
			available: true,
		});

		expect(useScreenShareStore.getState().remotePublications).toEqual([
			makePublication("alice"),
			makePublication("bob"),
		]);
	});

	it("replacePublications keeps only screen publications", () => {
		useScreenShareStore
			.getState()
			.replacePublications([
				makePublication("alice", "screen"),
				makePublication("alice", "camera"),
			]);

		expect(useScreenShareStore.getState().remotePublications).toEqual([
			makePublication("alice", "screen"),
		]);
	});

	it("upsertPublication ignores camera publications", () => {
		useScreenShareStore.getState().upsertPublication({
			...makePublication("alice", "camera"),
			available: true,
		});
		expect(useScreenShareStore.getState().remotePublications).toEqual([]);
	});

	it("upsertRemote keeps one entry per identity and appends new identities", () => {
		useScreenShareStore.getState().upsertRemote(makeRemote("alice"));
		const replacement = makeRemote("alice");
		useScreenShareStore.getState().upsertRemote(replacement);
		const bob = makeRemote("bob");
		useScreenShareStore.getState().upsertRemote(bob);

		expect(useScreenShareStore.getState().remote).toEqual([replacement, bob]);
	});

	it("reset clears remote, publications, localSharing and localTrack", () => {
		const store = useScreenShareStore;
		store.getState().upsertRemote(makeRemote("alice"));
		store.getState().replacePublications([makePublication("bob")]);
		store.getState().setLocalSharing(true);
		store.getState().setLocalTrack(makeTrack());

		store.getState().reset();

		const state = store.getState();
		expect(state.remote).toEqual([]);
		expect(state.remotePublications).toEqual([]);
		expect(state.localSharing).toBe(false);
		expect(state.localTrack).toBeNull();
	});
});
