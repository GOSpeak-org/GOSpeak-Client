import { Slider } from "@gospeak/components";
import { useAudioDeviceStore } from "@/stores/audioDeviceStore";
import {
	useVoiceChatActions,
	useVoiceChatStore,
} from "@/stores/voiceChatStore";
import { Field, Page, Section, Toggle } from "./shared";
import type { SettingTabConfig } from "./types";

export function VoicePanel() {
	const muteOnJoin = useAudioDeviceStore((s) => s.muteOnJoin);
	const notificationSounds = useAudioDeviceStore((s) => s.notificationSounds);
	const data = useVoiceChatStore();
	const { setInputVolume, setOutputVolume } = useVoiceChatActions();

	return (
		<>
			<Section title="进房行为">
				<Toggle
					label="加入房间时静音麦克风"
					desc="进房后默认不推流，可手动开麦"
					checked={muteOnJoin}
					onChange={(v) => useAudioDeviceStore.getState().setMuteOnJoin(v)}
				/>
				<Toggle
					label="进出房提示音"
					desc="自己与他人加入/离开时播放短提示音"
					checked={notificationSounds}
					onChange={(v) =>
						useAudioDeviceStore.getState().setNotificationSounds(v)
					}
				/>
			</Section>

			<Section title="本机音量">
				<Field label={`麦克风输入音量 · ${data.inputVolume}%`}>
					<Slider
						value={[data.inputVolume]}
						max={100}
						step={1}
						onValueChange={(value) => setInputVolume(value[0] ?? 0)}
						aria-label="麦克风输入音量"
					/>
				</Field>
				<Field label={`扬声器输出音量 · ${data.outputVolume}%`}>
					<Slider
						value={[data.outputVolume]}
						max={100}
						step={1}
						onValueChange={(value) => setOutputVolume(value[0] ?? 0)}
						aria-label="扬声器输出音量"
					/>
				</Field>
			</Section>
		</>
	);
}

function VoiceForm() {
	return (
		<Page title="语音行为" desc="进房默认状态、本机输入/输出音量与提示音。">
			<VoicePanel />
		</Page>
	);
}

const voice: SettingTabConfig = {
	id: "voice",
	label: "语音",
	icon: "volume",
	component: VoiceForm,
};

export default voice;
