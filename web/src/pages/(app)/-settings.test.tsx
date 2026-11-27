import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
	navigate: vi.fn(),
	logout: vi.fn(async () => {}),
	clearSession: vi.fn(async () => {}),
	fieldProps: null as null | { onBeforeSwitch?: () => void | Promise<void> },
	user: null as null | { display_name: string; name: string; role: string },
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: Record<string, unknown>) => opts,
	useNavigate: () => h.navigate,
}));

vi.mock("@gospeak/mobile-capabilities", () => ({
	inMobile: () => true,
	createServerConfig: () => ({
		getBaseUrlSync: () => "",
		getBaseUrl: async () => "",
		setBaseUrl: async () => {},
	}),
	createAudioRoute: () => ({
		list: async () => [],
		refresh: async () => {},
		current: () => "speaker",
		set: async () => {},
	}),
}));

vi.mock("@gospeak/desktop", () => ({
	inDesktop: () => false,
	createServerConfig: () => ({
		getBaseUrlSync: () => "",
		getBaseUrl: async () => "",
		setBaseUrl: async () => {},
	}),
}));

vi.mock("@/components/common/serverUrlField", () => ({
	default: (props: { onBeforeSwitch?: () => void | Promise<void> }) => {
		h.fieldProps = props;
		return <div>服务器地址输入框</div>;
	},
}));

vi.mock("@/components/mobile/serverSwitch", () => ({
	clearSessionForServerSwitch: () => h.clearSession(),
}));

vi.mock("idb-keyval", () => ({
	get: vi.fn(async () => undefined),
	set: vi.fn(async () => {}),
	del: vi.fn(async () => {}),
}));

vi.mock("@/components/modal/settingModal/tab_item/audio", () => ({
	AudioPanel: () => <div data-testid="audio-panel" />,
}));
vi.mock("@/components/modal/settingModal/tab_item/voice", () => ({
	VoicePanel: () => <div data-testid="voice-panel" />,
}));

vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({ data: [] }),
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/api/oauth", () => ({
	getEnabledProviders: vi.fn(async () => []),
	getOAuthBindURL: (p: string) => `/api/v1/oauth/bind/${p}`,
	listLinkedAccounts: vi.fn(async () => []),
	unlinkAccount: vi.fn(async () => null),
}));

vi.mock("@/api/auth", () => ({
	changePassword: vi.fn(async () => {}),
}));

vi.mock("@/stores/userStore", () => ({
	useUserStore: Object.assign(
		(
			selector: (s: {
				user: typeof h.user;
				logout: () => Promise<void>;
			}) => unknown,
		) => selector({ user: h.user, logout: h.logout }),
		{ getState: () => ({ user: h.user, logout: h.logout }) },
	),
}));

import SettingsPage from "@/components/mobile/settingsPage";

afterEach(cleanup);

describe("移动端设置页", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		h.fieldProps = null;
		h.user = { display_name: "阿明", name: "amin", role: "admin" };
	});

	it("渲染服务器地址区块与账号信息", () => {
		render(<SettingsPage />);
		expect(screen.getByText("设置", { selector: "h1" })).toBeTruthy();
		expect(screen.getByText("服务器地址输入框")).toBeTruthy();
		expect(screen.getByText("阿明")).toBeTruthy();
		expect(screen.getByText("admin")).toBeTruthy();
	});

	it("退出登录清会话并回到登录页", async () => {
		render(<SettingsPage />);
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
		});
		expect(h.logout).toHaveBeenCalled();
		expect(h.navigate).toHaveBeenCalledWith({ to: "/login", replace: true });
	});

	it("传给服务器地址组件的回调会清理会话", async () => {
		render(<SettingsPage />);
		expect(h.fieldProps?.onBeforeSwitch).toBeTypeOf("function");
		await h.fieldProps?.onBeforeSwitch?.();
		expect(h.clearSession).toHaveBeenCalled();
	});

	it("窄视口下提供音频与语音设置入口", () => {
		render(<SettingsPage />);
		expect(screen.getByText("音频设备")).toBeTruthy();
		expect(screen.getByText("语音行为")).toBeTruthy();
	});

	it("窄视口下同样提供修改密码入口", () => {
		render(<SettingsPage />);
		expect(screen.getByLabelText("当前密码")).toBeTruthy();
		expect(screen.getByLabelText("新密码")).toBeTruthy();
		expect(screen.getByLabelText("确认新密码")).toBeTruthy();
		expect(screen.getByRole("button", { name: "修改密码" })).toBeTruthy();
	});

	it("两次新密码不一致时提示且不发请求", async () => {
		const { changePassword } = await import("@/api/auth");
		render(<SettingsPage />);
		fireEvent.change(screen.getByLabelText("新密码"), {
			target: { value: "aaa111" },
		});
		fireEvent.change(screen.getByLabelText("确认新密码"), {
			target: { value: "bbb222" },
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "修改密码" }));
		});
		expect(screen.getByText("两次输入的新密码不一致")).toBeTruthy();
		expect(changePassword).not.toHaveBeenCalled();
	});
});
