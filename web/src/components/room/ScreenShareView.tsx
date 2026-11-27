import type { RemoteVideoTrackLike } from "@gospeak/sfu-client/types";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";

/**
 * 把 provider 的视频 track 附到一个 <video> 上。
 * 屏幕共享本身不带音频（音频走独立的 audio track），所以默认静音播放。
 *
 * 外层容器按视频实际画面比例收缩（object-contain 不留黑边）；全屏走浏览器
 * 原生 controls。forwardRef 暴露 <video> 本身，供外层按需操作。
 */
const ScreenShareView = forwardRef<
	HTMLVideoElement,
	{
		track: RemoteVideoTrackLike;
		className?: string;
		onClick?: () => void;
	}
>(({ track, className, onClick }, ref) => {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [aspectRatio, setAspectRatio] = useState<string | null>(null);
	useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement, []);

	useEffect(() => {
		const el = videoRef.current;
		if (!el) return;
		setAspectRatio(null);
		track.attach(el);

		const play = () => {
			void el.play().catch(() => {});
		};
		const syncRatio = () => {
			if (!el.videoWidth || !el.videoHeight) return;
			setAspectRatio(`${el.videoWidth} / ${el.videoHeight}`);
		};

		el.addEventListener("loadedmetadata", play);
		el.addEventListener("loadedmetadata", syncRatio);
		el.addEventListener("resize", syncRatio);
		play();
		syncRatio();
		return () => {
			el.removeEventListener("loadedmetadata", play);
			el.removeEventListener("loadedmetadata", syncRatio);
			el.removeEventListener("resize", syncRatio);
			track.detach(el);
		};
	}, [track]);

	return (
		<div
			className={`relative flex max-h-full max-w-full min-h-0 min-w-0 overflow-hidden ${className ?? ""}`}
			style={{ aspectRatio: aspectRatio ?? "16 / 9" }}
		>
			<video
				ref={videoRef}
				autoPlay
				playsInline
				muted
				controls
				className="block h-full w-full object-contain"
				onClick={onClick}
			/>
		</div>
	);
});

ScreenShareView.displayName = "ScreenShareView";

export default ScreenShareView;
