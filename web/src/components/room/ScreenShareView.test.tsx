import type { RemoteVideoTrackLike } from "@gospeak/sfu-client/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScreenShareView from "./ScreenShareView";

function makeTrack() {
	const attach = vi.fn();
	const detach = vi.fn(() => []);
	const track: RemoteVideoTrackLike = { attach, detach };
	return { track, attach, detach };
}

function stubIntrinsicSize(
	video: HTMLVideoElement,
	width: number,
	height: number,
) {
	Object.defineProperty(video, "videoWidth", {
		configurable: true,
		value: width,
	});
	Object.defineProperty(video, "videoHeight", {
		configurable: true,
		value: height,
	});
}

describe("ScreenShareView", () => {
	beforeEach(() => {
		// jsdom 不实现媒体播放，返回 undefined 而不是 Promise
		vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("把 track 附到 video 上，卸载时 detach", () => {
		const { track, attach, detach } = makeTrack();
		const { container, unmount } = render(<ScreenShareView track={track} />);

		const video = container.querySelector("video");
		expect(attach).toHaveBeenCalledWith(video);

		unmount();
		expect(detach).toHaveBeenCalledWith(video);
	});

	it("forwardRef 暴露的是 video 元素本身", () => {
		const { track } = makeTrack();
		const ref = createRef<HTMLVideoElement>();
		const { container } = render(<ScreenShareView ref={ref} track={track} />);

		expect(ref.current).toBe(container.querySelector("video"));
		expect(ref.current?.tagName).toBe("VIDEO");
	});

	it("使用原生 controls，不渲染自定义全屏按钮", () => {
		const { track } = makeTrack();
		const { container } = render(<ScreenShareView track={track} />);

		expect(container.querySelector("video")?.hasAttribute("controls")).toBe(
			true,
		);
		expect(screen.queryByRole("button")).toBeNull();
	});

	it("点击画面本身触发 onClick", () => {
		const { track } = makeTrack();
		const onClick = vi.fn();
		render(<ScreenShareView track={track} onClick={onClick} />);

		const video = document.querySelector("video") as HTMLVideoElement;
		fireEvent.click(video);
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it("按视频真实分辨率给容器设宽高比，避免黑边", () => {
		const { track } = makeTrack();
		const { container } = render(<ScreenShareView track={track} />);
		const wrapper = container.firstElementChild as HTMLElement;
		const video = container.querySelector("video") as HTMLVideoElement;

		expect(wrapper.style.aspectRatio.replace(/\s/g, "")).toBe("16/9");

		stubIntrinsicSize(video, 1600, 1200);
		fireEvent.loadedMetadata(video);
		expect(wrapper.style.aspectRatio.replace(/\s/g, "")).toBe("1600/1200");
	});
});
