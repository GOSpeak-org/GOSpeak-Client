import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	listUsers: vi.fn(),
	updateUserRole: vi.fn(),
}));

// packages/components 当前工作树里新增的 dropdown-menu/popover 没有对应依赖，
// 这里只把测试用到的 UI 原语替换掉，ConfirmModal 与页面状态逻辑仍是真实实现。
vi.mock("@gospeak/components", async () => {
	const React = await import("react");
	return {
		Button: ({
			variant: _variant,
			size: _size,
			...props
		}: Record<string, unknown>) => React.createElement("button", props),
		Skeleton: (props: Record<string, unknown>) =>
			React.createElement("div", props),
		Input: (props: Record<string, unknown>) =>
			React.createElement("input", props),
		Dialog: ({
			open,
			children,
		}: {
			open: boolean;
			children: React.ReactNode;
		}) => (open ? React.createElement("div", null, children) : null),
		DialogContent: ({
			children,
			showClose: _showClose,
			...props
		}: Record<string, unknown>) =>
			React.createElement(
				"div",
				{ role: "dialog", ...props },
				children as React.ReactNode,
			),
		DialogTitle: ({ children }: { children: React.ReactNode }) =>
			React.createElement("h2", null, children),
		toast: Object.assign(vi.fn(), {
			success: vi.fn(),
			error: vi.fn(),
			warning: vi.fn(),
			info: vi.fn(),
		}),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => () => ({}),
}));

vi.mock("@/api/user", () => ({
	listUsers: mocks.listUsers,
	updateUserRole: mocks.updateUserRole,
}));

vi.mock("@/utils/permissions", () => ({ hasPermission: () => true }));
vi.mock("@/utils/accessDenied", () => ({ denyAccess: () => {} }));

vi.mock("@/components/manage/UserSearchSelect", () => ({
	default: ({ onChange }: { onChange: (value: string | "") => void }) => (
		<button type="button" onClick={() => onChange("u-7")}>
			select user 7
		</button>
	),
}));

import BanPage from "./index";

const USER = {
	id: 7,
	uuid: "u-7",
	name: "alice",
	display_name: "爱丽丝",
	avatar: "",
	role: "user",
};

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<BanPage />
		</QueryClientProvider>,
	);
}

async function openBanDialog() {
	await userEvent.click(screen.getByRole("button", { name: "select user 7" }));
	const trigger = screen.getByRole("button", { name: /确认封禁/ });
	await waitFor(() =>
		expect((trigger as HTMLButtonElement).disabled).toBe(false),
	);
	await userEvent.click(trigger);
	return screen.getByRole("dialog");
}

beforeEach(() => {
	mocks.listUsers.mockResolvedValue({ users: [USER], total: 1 });
	mocks.updateUserRole.mockReset();
});

afterEach(cleanup);

describe("封禁管理确认弹窗", () => {
	it("请求进行中保持弹窗打开并显示 loading，成功后关闭", async () => {
		renderPage();
		let resolveRequest: (() => void) | undefined;
		mocks.updateUserRole.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveRequest = () => resolve(undefined);
				}),
		);

		const dialog = await openBanDialog();
		expect(dialog.textContent).toContain("封禁后该用户无法登录与访问");

		await userEvent.click(within(dialog).getByRole("button", { name: "封禁" }));

		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(
			screen.getByRole("dialog").querySelector(".animate-spin"),
		).not.toBeNull();

		await act(async () => {
			resolveRequest?.();
		});

		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(mocks.updateUserRole).toHaveBeenCalledWith("u-7", "ban");
	});

	it("请求失败时保持弹窗打开并展示错误上下文", async () => {
		renderPage();
		mocks.updateUserRole.mockImplementation(() =>
			Promise.reject(new Error("network down")),
		);

		const dialog = await openBanDialog();
		await userEvent.click(within(dialog).getByRole("button", { name: "封禁" }));

		await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
		expect(screen.getByRole("dialog").textContent).toContain("network down");
	});
});
