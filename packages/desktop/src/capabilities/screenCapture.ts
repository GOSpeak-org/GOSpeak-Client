import { bridge, command } from "../bridge";
import { isDesktop } from "../runtime";

/** Mirrors screenCaptureStatusString in app/desktop/screencapture.go. */
export type ScreenRecordingStatus =
	| "granted"
	| "denied"
	| "unknown"
	| "unsupported";

/**
 * Screen Recording permission for desktop screen sharing. MyGo's WebView only
 * prompts for camera/microphone, so the host checks/guides this OS permission
 * before the page calls getDisplayMedia(). In a plain browser the picker
 * handles permission itself and both calls are no-ops that report granted.
 */
export function checkScreenRecording(): Promise<ScreenRecordingStatus> {
	if (isDesktop()) {
		return bridge.invoke<ScreenRecordingStatus>(
			command("ScreenCapture", "Check"),
		);
	}
	return Promise.resolve("granted");
}

/** Opens System Settings and waits for the user to grant Screen Recording. */
export function guideScreenRecording(): Promise<ScreenRecordingStatus> {
	if (isDesktop()) {
		return bridge.invoke<ScreenRecordingStatus>(
			command("ScreenCapture", "Guide"),
		);
	}
	return Promise.resolve("granted");
}
