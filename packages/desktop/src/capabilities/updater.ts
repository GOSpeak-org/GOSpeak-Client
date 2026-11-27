import { bridge, command } from "../bridge";
import { desktopEvents } from "../events";
import { isDesktop } from "../runtime";

export interface UpdateInfo {
	/** A newer release was found by the last check. */
	available: boolean;
	/** Version of the newer release ("" when up to date). */
	version?: string;
	/** Release notes in Markdown ("" when up to date). */
	notes?: string;
	/** Version of the running build. */
	current: string;
	/**
	 * This build can self-update: false for dev builds and releases built
	 * before `updates` was configured in the MyGo host (mygo.config.ts).
	 * When false, offer openReleasePage() instead of install().
	 */
	supported: boolean;
}

/** Info about the newest GitHub release and the installer for this platform. */
export interface ReleaseInfo {
	available: boolean;
	version: string;
	notes: string;
	current: string;
	assetName: string;
	url: string;
}

export interface Updater {
	/** Check the release feed for a newer version. */
	check(): Promise<UpdateInfo>;
	/**
	 * Download, verify and install the update found by check(), then the
	 * host relaunches into the new version. Only valid when the last
	 * check() returned available=true and supported=true.
	 */
	install(): Promise<void>;
	/** Fires as download progress goes 0..1. */
	onProgress(handler: (fraction: number) => void): () => void;
	/** Version of the running build ("dev" when run from source). */
	currentVersion(): Promise<string>;
	/**
	 * Open the GitHub releases page in the system browser — the fallback
	 * for builds that cannot self-update (supported=false).
	 */
	openReleasePage(): Promise<void>;
	/** Check GitHub Releases for a newer desktop release and its matching installer. */
	checkRelease(): Promise<ReleaseInfo>;
	/** Download the chosen installer to ~/Downloads, reporting progress on updater.progress. */
	downloadRelease(url: string): Promise<void>;
}

const webFallback: Updater = {
	async check() {
		return {
			available: false,
			current: "dev",
			supported: false,
		};
	},
	async install() {},
	onProgress() {
		return () => {};
	},
	async currentVersion() {
		return "dev";
	},
	async openReleasePage() {},
	async checkRelease() {
		return {
			available: false,
			version: "",
			notes: "",
			current: "dev",
			assetName: "",
			url: "",
		};
	},
	async downloadRelease() {},
};

const native: Updater = {
	check: () => bridge.invoke<UpdateInfo>(command("Updater", "Check")),
	install: () => bridge.invoke(command("Updater", "Install")),
	onProgress: (handler) =>
		bridge.listen(desktopEvents.updaterProgress, (p) => handler(p as number)),
	currentVersion: () =>
		bridge.invoke<string>(command("Updater", "CurrentVersion")),
	openReleasePage: () => bridge.invoke(command("Updater", "OpenReleasePage")),
	checkRelease: () =>
		bridge.invoke<ReleaseInfo>(command("Updater", "CheckRelease")),
	downloadRelease: (url) =>
		bridge.invoke(command("Updater", "DownloadRelease"), url),
};

/** Returns native updater inside the desktop host, web fallback otherwise. */
export function createUpdater(): Updater {
	return isDesktop() ? native : webFallback;
}
