import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getBackground: vi.fn(),
	putBackground: vi.fn(),
	deleteBackground: vi.fn(),
	compressImage: vi.fn(),
	toastActionError: vi.fn((_error: unknown, fallback: string) => fallback),
}));

vi.mock("@/utils/backgroundDb", () => ({
	getBackground: mocks.getBackground,
	putBackground: mocks.putBackground,
	deleteBackground: mocks.deleteBackground,
}));
vi.mock("@/utils/backgroundImage", () => ({
	compressImage: mocks.compressImage,
}));
vi.mock("@/utils/toast", () => ({
	toastActionError: mocks.toastActionError,
}));

import BackgroundSection from "./BackgroundSection";
import {
	createBackgroundStore,
	useBackgroundStore,
} from "@/stores/backgroundStore";

beforeEach(() => {
	localStorage.clear();
	vi.clearAllMocks();
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	URL.createObjectURL = vi.fn(() => "blob:mock-preview");
	URL.revokeObjectURL = vi.fn();
	document.documentElement.className = "";
	document.documentElement.style.cssText = "";
	document.body.style.backgroundImage = "";
	createBackgroundStore();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("BackgroundSection", () => {
	it("shows the upload placeholder and disables controls without an image", () => {
		render(<BackgroundSection />);
		expect(screen.getByText("上传背景图")).toBeTruthy();
		expect(screen.getByText("均衡").closest("button")?.disabled).toBe(true);
		expect(
			screen
				.getAllByRole("slider")
				.every((el) => el.getAttribute("data-disabled") === ""),
		).toBe(true);
		expect(screen.queryByText("更换")).toBeNull();
	});

	it("shows preview with actions once an image is set", () => {
		useBackgroundStore.setState({ hasImage: true, activeUrl: "blob:preview" });
		render(<BackgroundSection />);
		expect(screen.getByAltText("背景图预览")).toBeTruthy();
		expect(screen.getByText("更换")).toBeTruthy();
		expect(screen.getByText("删除")).toBeTruthy();
		expect(screen.getByText("均衡").closest("button")?.disabled).toBe(false);
		expect(screen.getAllByRole("slider")).toHaveLength(2);
	});

	it("states the image is shared across dark and light modes", () => {
		render(<BackgroundSection />);
		expect(screen.getByText(/深色与浅色模式共用/)).toBeTruthy();
	});

	it("removes the image via the store", async () => {
		useBackgroundStore.setState({ hasImage: true, activeUrl: "blob:preview" });
		render(<BackgroundSection />);
		fireEvent.click(screen.getByText("删除"));
		await waitFor(() => expect(mocks.deleteBackground).toHaveBeenCalled());
		await waitFor(() => expect(screen.getByText("上传背景图")).toBeTruthy());
	});

	it("applies a preset", () => {
		useBackgroundStore.setState({ hasImage: true, activeUrl: "blob:preview" });
		render(<BackgroundSection />);
		fireEvent.click(screen.getByText("沉浸"));
		expect(
			JSON.parse(localStorage.getItem("background-glass") ?? "{}"),
		).toEqual({
			strength: 83,
			opacity: 40,
		});
	});

	it("updates a slider value and marks the result as custom", () => {
		useBackgroundStore.setState({ hasImage: true, activeUrl: "blob:preview" });
		render(<BackgroundSection />);
		const opacitySlider = screen.getAllByRole("slider")[1] as HTMLElement;
		fireEvent.keyDown(opacitySlider, { key: "ArrowRight" });
		expect(useBackgroundStore.getState().glass.opacity).toBe(69);
		expect(
			JSON.parse(localStorage.getItem("background-glass") ?? "{}"),
		).toEqual({
			strength: 58,
			opacity: 69,
		});
		expect(screen.getByText("自定义")).toBeTruthy();
	});

	it("disables the section when the environment is unsupported", () => {
		useBackgroundStore.setState({ available: false });
		render(<BackgroundSection />);
		expect(
			screen.getByText("当前环境不支持存储背景图，功能已停用。"),
		).toBeTruthy();
		expect(screen.queryByText("上传背景图")).toBeNull();
	});
});
