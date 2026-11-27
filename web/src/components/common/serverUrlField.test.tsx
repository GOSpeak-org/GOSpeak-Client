import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
	baseUrl: "",
	setBaseUrl: vi.fn(async (_url: string) => {}),
	navigate: vi.fn(),
	mobile: false,
	callOrder: [] as string[],
	onBeforeSwitch: vi.fn(async () => {}),
	setPublicBaseUrl: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => h.navigate }));
vi.mock("@gospeak/desktop", () => ({
	inDesktop: () => false,
	createServerConfig: () => ({
		getBaseUrlSync: () => h.baseUrl,
		getBaseUrl: async () => h.baseUrl,
		setBaseUrl: h.setBaseUrl,
	}),
}));
vi.mock("@gospeak/mobile-capabilities", () => ({
	createServerConfig: () => ({
		getBaseUrlSync: () => h.baseUrl,
		getBaseUrl: async () => h.baseUrl,
		setBaseUrl: h.setBaseUrl,
	}),
}));
vi.mock("@/utils/domainInvite", () => ({ parseInviteLink: () => null }));
vi.mock("@/utils/pendingInvite", () => ({
	clearPendingInvite: () => {},
	setPendingInvite: () => {},
}));
vi.mock("@/utils/publicBaseUrl", () => ({
	setPublicBaseUrl: (url: string) => h.setPublicBaseUrl(url),
}));

import ServerUrlField from "./serverUrlField";

describe("ServerUrlField / 服务器地址归一", () => {
	beforeEach(() => {
		h.baseUrl = "";
		h.callOrder.length = 0;
		h.setBaseUrl.mockReset();
		h.setBaseUrl.mockImplementation(async () => {
			h.callOrder.push("switch");
		});
		h.onBeforeSwitch.mockReset();
		h.onBeforeSwitch.mockImplementation(async () => {
			h.callOrder.push("clear");
		});
		h.setPublicBaseUrl.mockClear();
	});

	afterEach(cleanup);

	it("保存前去掉首尾空白与末尾斜杠", async () => {
		render(<ServerUrlField />);
		const input = screen.getByLabelText<HTMLInputElement>("服务器地址");

		fireEvent.change(input, {
			target: { value: "  https://voice.example.com///  " },
		});
		await act(async () => {
			fireEvent.keyDown(input, { key: "Enter" });
		});

		expect(h.setBaseUrl).toHaveBeenCalledWith("https://voice.example.com");
	});

	it("保存后输入框收敛到规范值（浏览器端不重载页面）", async () => {
		render(<ServerUrlField />);
		const input = screen.getByLabelText<HTMLInputElement>("服务器地址");

		fireEvent.change(input, {
			target: { value: "https://voice.example.com/" },
		});
		await act(async () => {
			fireEvent.keyDown(input, { key: "Enter" });
		});

		expect(input.value).toBe("https://voice.example.com");
	});

	it("首帧展示的镜像值同样被归一", async () => {
		h.baseUrl = "https://voice.example.com/";
		render(<ServerUrlField />);
		const input = screen.getByLabelText<HTMLInputElement>("服务器地址");

		await vi.waitFor(() =>
			expect(input.value).toBe("https://voice.example.com"),
		);
	});
});

describe("ServerUrlField / 移动端切换服务器", () => {
	afterEach(cleanup);

	it("先清会话再切换，地址归一并给出成功反馈", async () => {
		render(<ServerUrlField mobile onBeforeSwitch={h.onBeforeSwitch} />);
		const input = screen.getByLabelText<HTMLInputElement>("服务器地址");
		fireEvent.change(input, {
			target: { value: "  https://new.example.com///  " },
		});

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "连接服务器" }));
		});

		expect(h.callOrder).toEqual(["clear", "switch"]);
		expect(h.setBaseUrl).toHaveBeenCalledWith("https://new.example.com");
		expect(h.setPublicBaseUrl).toHaveBeenCalledWith("https://new.example.com");
		expect(screen.getByText(/服务器地址已更新/)).toBeTruthy();
	});

	it("清会话失败时不切换服务器，并展示错误", async () => {
		h.onBeforeSwitch.mockRejectedValueOnce(new Error("清理会话失败"));
		render(<ServerUrlField mobile onBeforeSwitch={h.onBeforeSwitch} />);
		const input = screen.getByLabelText<HTMLInputElement>("服务器地址");
		fireEvent.change(input, {
			target: { value: "https://new.example.com" },
		});

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "连接服务器" }));
		});

		expect(h.setBaseUrl).not.toHaveBeenCalled();
		expect(screen.getByText("清理会话失败")).toBeTruthy();
	});

	it("原生切换失败时展示错误反馈", async () => {
		h.setBaseUrl.mockRejectedValueOnce(new Error("连接失败"));
		render(<ServerUrlField mobile />);
		const input = screen.getByLabelText<HTMLInputElement>("服务器地址");
		fireEvent.change(input, {
			target: { value: "https://new.example.com" },
		});

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "连接服务器" }));
		});

		expect(screen.getByText("连接失败")).toBeTruthy();
	});

	it("移动端失焦不触发切换，必须显式点击连接", async () => {
		render(<ServerUrlField mobile />);
		const input = screen.getByLabelText<HTMLInputElement>("服务器地址");
		fireEvent.change(input, {
			target: { value: "https://new.example.com" },
		});

		await act(async () => {
			fireEvent.blur(input);
		});

		expect(h.setBaseUrl).not.toHaveBeenCalled();
	});
});
