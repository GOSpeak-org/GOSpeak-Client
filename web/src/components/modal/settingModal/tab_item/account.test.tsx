import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/oauth", () => ({
	getEnabledProviders: vi.fn(async () => [
		{ name: "github", display_name: "GitHub", icon_url: "" },
		{ name: "qq", display_name: "QQ", icon_url: "" },
	]),
	getOAuthBindURL: (p: string) => `/api/v1/oauth/bind/${p}`,
	listLinkedAccounts: vi.fn(async () => [
		{ provider: "github", display_name: "GitHub", icon_url: "" },
	]),
	unlinkAccount: vi.fn(async () => null),
}));

vi.mock("@/api/auth", () => ({
	changePassword: vi.fn(async () => {}),
}));

vi.mock("@/components/oauth/ProviderIcon", () => ({
	default: ({ name }: { name: string }) => <span>{name}-icon</span>,
}));

import { changePassword } from "@/api/auth";
import { unlinkAccount } from "@/api/oauth";
import { AccountTab } from "./account";

const renderTab = () => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<AccountTab />
		</QueryClientProvider>,
	);
};

const passwordField = (label: string) =>
	screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(cleanup);

describe("AccountTab / 账号", () => {
	it("展示已绑定与可绑定账号", async () => {
		renderTab();
		expect(await screen.findByText("github-icon")).toBeTruthy();
		expect(screen.getByText("QQ")).toBeTruthy();
	});

	it("解绑后刷新列表", async () => {
		renderTab();
		const unlink = await screen.findByRole("button", { name: "解绑 GitHub" });
		await userEvent.click(unlink);
		const confirm = await screen.findByRole("button", { name: "解绑" });
		await userEvent.click(confirm);
		expect(unlinkAccount).toHaveBeenCalledWith("github");
	});

	it("两次新密码不一致时只本地提示，不发请求", async () => {
		renderTab();
		await screen.findByText("github-icon");
		await userEvent.type(passwordField("当前密码"), "old-pass");
		await userEvent.type(passwordField("新密码"), "new-pass");
		await userEvent.type(passwordField("确认新密码"), "other-pass");
		await userEvent.click(screen.getByRole("button", { name: "修改密码" }));

		expect(screen.getByText("两次输入的新密码不一致")).toBeTruthy();
		expect(changePassword).not.toHaveBeenCalled();
	});

	it("新密码为空时不发请求", async () => {
		renderTab();
		await screen.findByText("github-icon");
		await userEvent.click(screen.getByRole("button", { name: "修改密码" }));

		expect(screen.getByText("请输入新密码")).toBeTruthy();
		expect(changePassword).not.toHaveBeenCalled();
	});

	it("提交成功后调用 changePassword 并清空输入", async () => {
		renderTab();
		await screen.findByText("github-icon");
		await userEvent.type(passwordField("当前密码"), "old-pass");
		await userEvent.type(passwordField("新密码"), "new-pass");
		await userEvent.type(passwordField("确认新密码"), "new-pass");
		await userEvent.click(screen.getByRole("button", { name: "修改密码" }));

		await waitFor(() =>
			expect(changePassword).toHaveBeenCalledWith("old-pass", "new-pass"),
		);
		expect(passwordField("当前密码").value).toBe("");
		expect(passwordField("新密码").value).toBe("");
		expect(passwordField("确认新密码").value).toBe("");
	});
});
