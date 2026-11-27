import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
	clearAuth: vi.fn(),
	logoutApi: vi.fn(async () => {}),
}));

vi.mock("@/api/auth", () => ({ logout: () => h.logoutApi() }));
vi.mock("@/stores/userStore", () => ({
	userStore: { clearAuth: () => h.clearAuth() },
}));

import { clearSessionForServerSwitch } from "./serverSwitch";

describe("切换服务器前的会话清理", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("先同步清本地会话，再请求旧服务器登出以清除 HttpOnly Cookie", async () => {
		const order: string[] = [];
		h.clearAuth.mockImplementation(() => order.push("clear"));
		h.logoutApi.mockImplementation(async () => {
			order.push("logout");
		});

		await clearSessionForServerSwitch();

		expect(order).toEqual(["clear", "logout"]);
	});

	it("旧服务器登出失败时不阻断服务器切换", async () => {
		h.logoutApi.mockRejectedValueOnce(new Error("unreachable"));

		await expect(clearSessionForServerSwitch()).resolves.toBeUndefined();
		expect(h.clearAuth).toHaveBeenCalled();
	});
});
