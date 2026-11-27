import { useEffect, useRef } from "react";
import type { VoicePhase } from "@/components/room/session/voiceSessionTypes";
import {
	playJoinSound,
	playLeaveSound,
	setNotificationSoundEnabled,
} from "@/handler_audio/notificationSounds";
import { useAudioDeviceStore } from "@/stores/audioDeviceStore";
import { socketStore, useSocketStore } from "@/stores/socketStore";
import { useUserStore } from "@/stores/userStore";

/**
 * 统一房间进入/离开提示音，集中在房间编排层处理，不进入 SFU 抽象层：
 * - 他人进入/离开：由信令在线状态（presence）驱动，与媒体会话无关
 * - 自己进入：由媒体会话建连完成（media_ready/ready）驱动
 * - 自己离开/切房：由房间身份变化驱动——切房时 resolving 会被 React 批处理跳过，
 *   phase 直接从 ready 跳到 loading_sfu，不能只靠 phase 判断，否则切房没声音。
 * 音效实现留在 handler_audio/notificationSounds，SFUClient 只负责媒体会话生命周期。
 */
export function useRoomSounds(phase: VoicePhase, roomName: string | null) {
	// 同步设置页开关
	const notificationSounds = useAudioDeviceStore((s) => s.notificationSounds);
	useEffect(() => {
		setNotificationSoundEnabled(notificationSounds);
	}, [notificationSounds]);

	useEffect(() => {
		const dispose = socketStore.onPresence((event) => {
			const current = useSocketStore.getState().selectedRoomInfo?.name;
			if (event.room !== current) return;
			// 自己的进入音由媒体生命周期播放，避免重复触发
			if (event.identity === useUserStore.getState().user?.name) return;
			if (event.type === "member_joined") {
				playJoinSound();
				return;
			}
			playLeaveSound();
		});
		return dispose;
	}, []);

	const playedJoinOnMedia = useRef(false);
	const prevRoom = useRef<string | null>(roomName);
	const prevPhase = useRef<VoicePhase>("idle");

	useEffect(() => {
		const p = phase;
		if (p === "media_ready" || p === "ready") {
			if (!playedJoinOnMedia.current) {
				playedJoinOnMedia.current = true;
				playJoinSound();
			}
		} else if (p === "idle" || p === "resolving" || p === "failed") {
			playedJoinOnMedia.current = false;
		}

		// 房间身份变化是离开/切房的唯一信号：
		// - 切房 A→B：phase 因批处理从 ready 直接到 loading_sfu（看不到 resolving），
		//   但 roomName 立即变成 B，据此播离开音并复位进入音标记，新房 ready 会再播进入音。
		// - 主动离房 A→null：同样播离开音。
		// - 异常断连走 failed、房间名不变：不误播。
		const roomChanged = prevRoom.current !== roomName;
		if (roomChanged && prevRoom.current) {
			playLeaveSound();
			playedJoinOnMedia.current = false;
		}
		prevRoom.current = roomName;
		prevPhase.current = p;
	}, [phase, roomName]);
}
