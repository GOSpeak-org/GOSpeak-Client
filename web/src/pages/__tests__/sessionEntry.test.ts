import { beforeEach, describe, expect, it, vi } from "vitest";

// 冷启动入口规则：路由守卫只读本地缓存，绝不 await 网络。
// 否则后端不可达时，回环代理的 12s 上限会变成一段白屏转圈。

const h = vi.hoisted(() => ({
	user: null as null | { uuid: string },
	ensureSession: vi.fn(async () => true),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@tanstack/react-router")>();
	return {
		...actual,
		// 只覆盖两处：把 createFileRoute 变成"原样返回 options"，redirect 变成可断言的对象
		createFileRoute: () => (opts: Record<string, unknown>) => opts,
		redirect: (opts: { to: string }) => ({ redirectTo: opts.to }),
	};
});

vi.mock("@/stores/userStore", () => ({
	useUserStore: {
		getState: () => ({ user: h.user, ensureSession: h.ensureSession }),
	},
}));

vi.mock("@/layouts/layout", () => ({ default: () => null }));
vi.mock("@/components/common/errorBoundary", () => ({
	ErrorBoundary: () => null,
}));
vi.mock("@/components/common/keepAliveOutlet", () => ({
	KeepAliveOutlet: () => null,
}));

import { Route as AppRoute } from "@/pages/(app)/route";
import { Route as LoginRoute } from "@/pages/login";
import { Route as RegisterRoute } from "@/pages/register";

type Guard = () => unknown;

/** 真实类型把守卫收在 options 上，运行时 mock 直接返回它们。 */
const guardOf = (route: unknown): Guard =>
	(route as { beforeLoad: Guard }).beforeLoad;

const appGuard = guardOf(AppRoute);
const loginGuard = guardOf(LoginRoute);
const registerGuard = guardOf(RegisterRoute);

/** redirect() 是被 throw 出来的对象；取出目标路径。 */
async function redirectTargetOf(fn: Guard): Promise<string | null> {
	try {
		await fn();
		return null;
	} catch (e) {
		const value = e as { redirectTo?: string; options?: { to?: string } };
		return value.redirectTo ?? value.options?.to ?? null;
	}
}

describe("冷启动路由守卫不等网络", () => {
	beforeEach(() => {
		h.user = null;
		h.ensureSession.mockReset();
		h.ensureSession.mockImplementation(async () => true);
	});

	it("(app)：无缓存用户时同步跳登录页", async () => {
		expect(await redirectTargetOf(appGuard)).toBe("/login");
		expect(h.ensureSession).not.toHaveBeenCalled();
	});

	it("(app)：有缓存用户时立即放行，不等待 ensureSession", async () => {
		h.user = { uuid: "u-1" };
		// 后端不可达：ensureSession 永不结束
		h.ensureSession.mockImplementation(() => new Promise<boolean>(() => {}));

		const started = Date.now();
		await appGuard();
		// 放行必须发生在下一个微任务内，而不是等校验
		expect(Date.now() - started).toBeLessThan(20);
	});

	it("login：有缓存用户时同步跳首页", async () => {
		h.user = { uuid: "u-1" };
		expect(await redirectTargetOf(loginGuard)).toBe("/");
		expect(h.ensureSession).not.toHaveBeenCalled();
	});

	it("login：无缓存用户时立即停在登录页", async () => {
		const started = Date.now();
		expect(await redirectTargetOf(loginGuard)).toBeNull();
		expect(Date.now() - started).toBeLessThan(20);
		expect(h.ensureSession).not.toHaveBeenCalled();
	});

	it("register：有缓存用户时同步跳首页", async () => {
		h.user = { uuid: "u-1" };
		expect(await redirectTargetOf(registerGuard)).toBe("/");
		expect(h.ensureSession).not.toHaveBeenCalled();
	});
});
