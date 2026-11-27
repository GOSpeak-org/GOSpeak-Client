import { getPlugin } from "../bridge";

/**
 * 音频路由（扬声器 / 听筒 / 蓝牙 / 有线耳机）。
 *
 * 语音房间默认外放，但插上蓝牙耳机或贴耳通话时需要切换；无原生能力时
 * 一律降级为「扬声器」，调用方可无脑调用。
 */

export type AudioRouteKind = "speaker" | "earpiece" | "bluetooth" | "headset";

const ROUTE_KINDS: readonly AudioRouteKind[] = [
	"speaker",
	"earpiece",
	"bluetooth",
	"headset",
];

export interface AudioRouteOption {
	kind: AudioRouteKind;
	label: string;
}

interface AudioRoutePlugin {
	list(): Promise<{ routes: { kind: string; label: string }[] }>;
	current(): Promise<{ kind: string }>;
	set(options: { kind: string }): Promise<void>;
}

export interface AudioRoute {
	list(): Promise<AudioRouteOption[]>;
	current(): AudioRouteKind;
	set(kind: AudioRouteKind): Promise<void>;
	refresh(): Promise<void>;
}

export function isAudioRouteKind(value: unknown): value is AudioRouteKind {
	return (
		typeof value === "string" &&
		(ROUTE_KINDS as readonly string[]).includes(value)
	);
}

const FALLBACK_ROUTES: AudioRouteOption[] = [
	{ kind: "speaker", label: "扬声器" },
	{ kind: "earpiece", label: "听筒" },
];

export function createAudioRoute(): AudioRoute {
	let current: AudioRouteKind = "speaker";

	return {
		async list() {
			if (!__GOSPEAK_MOBILE__) return FALLBACK_ROUTES;
			try {
				const plugin = await getPlugin<AudioRoutePlugin>("AudioSession");
				const result = await plugin.list();
				const routes = result.routes
					.filter((r) => isAudioRouteKind(r.kind))
					.map((r) => ({ kind: r.kind as AudioRouteKind, label: r.label }));
				return routes.length > 0 ? routes : FALLBACK_ROUTES;
			} catch (error) {
				console.warn("[gospeak/mobile] AudioSession.list failed", error);
				return FALLBACK_ROUTES;
			}
		},
		current() {
			return current;
		},
		async set(kind) {
			if (!isAudioRouteKind(kind)) return;
			if (!__GOSPEAK_MOBILE__) return;
			try {
				const plugin = await getPlugin<AudioRoutePlugin>("AudioSession");
				await plugin.set({ kind });
				const now = await plugin.current();
				current = isAudioRouteKind(now?.kind) ? now.kind : kind;
			} catch (error) {
				console.warn("[gospeak/mobile] AudioSession.set failed", error);
			}
		},
		async refresh() {
			if (!__GOSPEAK_MOBILE__) return;
			try {
				const plugin = await getPlugin<AudioRoutePlugin>("AudioSession");
				const now = await plugin.current();
				const kind = now?.kind;
				if (isAudioRouteKind(kind)) current = kind;
			} catch (error) {
				console.warn("[gospeak/mobile] AudioSession.current failed", error);
			}
		},
	};
}
