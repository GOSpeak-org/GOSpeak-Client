import type {
	RemoteVideoPublicationInfo,
	RemoteVideoTrackInfo,
	RemoteVideoTrackLike,
} from "@gospeak/sfu-client/types";
import { create } from "zustand";

/**
 * 屏幕共享状态。
 *
 * track 对象不放进 React state 之外的地方：这里只负责「谁在共享 / track 是谁」，
 * 真正的 <video> 附着由 ScreenShareView 完成。
 */
interface ScreenShareState {
	/** 自己是否正在共享 */
	localSharing: boolean;
	/** 自己的共享 track（用于自预览） */
	localTrack: RemoteVideoTrackLike | null;
	/** 远端共享（屏幕 / 摄像头） */
	remote: RemoteVideoTrackInfo[];
	/** 可订阅的远端屏幕共享条目 */
	remotePublications: RemoteVideoPublicationInfo[];
	setLocalSharing: (sharing: boolean) => void;
	setLocalTrack: (track: RemoteVideoTrackLike | null) => void;
	upsertRemote: (info: RemoteVideoTrackInfo) => void;
	removeRemote: (identity: string) => void;
	upsertPublication: (
		info: RemoteVideoPublicationInfo & { available: boolean },
	) => void;
	replacePublications: (list: RemoteVideoPublicationInfo[]) => void;
	reset: () => void;
}

export const useScreenShareStore = create<ScreenShareState>((set) => ({
	localSharing: false,
	localTrack: null,
	remote: [],
	remotePublications: [],
	setLocalSharing: (localSharing) => set({ localSharing }),
	setLocalTrack: (localTrack) => set({ localTrack }),
	upsertRemote: (info) =>
		set((s) => {
			const next = s.remote.filter((item) => item.identity !== info.identity);
			next.push(info);
			return { remote: next };
		}),
	removeRemote: (identity) =>
		set((s) => ({
			remote: s.remote.filter((item) => item.identity !== identity),
		})),
	upsertPublication: ({ available, ...info }) => {
		if (info.source !== "screen") return;
		set((s) => {
			const existing = s.remotePublications.find(
				(item) =>
					item.identity === info.identity && item.source === info.source,
			);
			if (!available) {
				if (!existing) return s;
				return {
					remotePublications: s.remotePublications.filter(
						(item) => item !== existing,
					),
				};
			}
			if (existing) return s;
			return {
				remotePublications: [...s.remotePublications, info],
			};
		});
	},
	replacePublications: (list) =>
		set({
			remotePublications: list.filter((item) => item.source === "screen"),
		}),
	reset: () =>
		set({
			localSharing: false,
			localTrack: null,
			remote: [],
			remotePublications: [],
		}),
}));
