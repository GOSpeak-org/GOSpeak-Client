import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInstance = vi.hoisted(() => {
	const instance = {
		interceptors: {
			request: { use: vi.fn() },
			response: { use: vi.fn() },
		},
		request: vi.fn(),
	};
	return { instance };
});

const toastMock = vi.hoisted(() => ({
	error: vi.fn(),
	warning: vi.fn(),
	success: vi.fn(),
	info: vi.fn(),
}));

vi.mock("@gospeak/components", () => ({ toast: toastMock }));

vi.mock("axios", () => ({
	default: {
		create: vi.fn(() => mockInstance.instance),
	},
}));

import { APIClient } from "./apiClient";
import { resetToastDedup } from "@/utils/toast";

const response = (
	data: { code: number; msg: string; data?: unknown },
	config: Record<string, unknown> = {},
) => ({
	data,
	status: 200,
	statusText: "OK",
	headers: {},
	config,
});

describe("APIClient", () => {
	it("resolves Result.data instead of AxiosResponse", async () => {
		const client = new APIClient("/");
		mockInstance.instance.request.mockResolvedValue(
			response({ code: 0, msg: "success", data: { ok: true } }),
		);

		const value = await client.get<{ ok: boolean }>({ url: "/x" });
		expect(value.ok).toBe(true);
	});

	it("rejects with an Error carrying the backend msg when code !== 0", async () => {
		const client = new APIClient("/");
		mockInstance.instance.request.mockResolvedValue(
			response({ code: 3001, msg: "房间不存在", data: null }),
		);

		const error = await client.get({ url: "/room" }).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe("房间不存在");
	});

	it("propagates the interceptor __toastShown mark from the request config", async () => {
		const client = new APIClient("/");
		mockInstance.instance.request.mockResolvedValue(
			response({ code: 3001, msg: "房间不存在" }, { __toastShown: true }),
		);

		const error = (await client
			.post({ url: "/room" })
			.catch((e: unknown) => e)) as
			| (Error & { __toastShown?: boolean })
			| undefined;
		expect(error?.__toastShown).toBe(true);
	});

	it("defaults __toastShown to false when the config is unmarked", async () => {
		const client = new APIClient("/");
		mockInstance.instance.request.mockResolvedValue(
			response({ code: 3001, msg: "房间不存在" }),
		);

		const error = (await client
			.post({ url: "/room" })
			.catch((e: unknown) => e)) as
			| (Error & { __toastShown?: boolean })
			| undefined;
		expect(error?.__toastShown).toBe(false);
	});
});

const httpError = (
	status: number | undefined,
	data?: { code?: number; msg?: string } | string,
	config: Record<string, unknown> = {},
) => ({ config, response: { status, data } });

// 注册发生在 apiClient 模块加载时（default new APIClient），clearAllMocks 会清掉调用记录，
// 所以在模块作用域捕获一次 reject handler 供各用例复用。
const rejectHandler = vi.mocked(mockInstance.instance.interceptors.response.use)
	.mock.calls[0][1] as (error: unknown) => Promise<unknown>;

describe("apiClient error toast policy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetToastDedup();
	});

	it("never toasts for silent background requests", async () => {
		const error = httpError(404, undefined, {
			url: "/api/v1/announcement/unread-count",
			silentError: true,
		});
		await expect(rejectHandler(error)).rejects.toBe(error);
		expect(toastMock.error).not.toHaveBeenCalled();
		expect((error as { __toastShown?: boolean }).__toastShown).toBe(true);
	});

	it("keeps the interceptor quiet for skipErrorToast callers but marks them unhandled", async () => {
		const error = httpError(400, { msg: "bad" }, { skipErrorToast: true });
		await expect(rejectHandler(error)).rejects.toBe(error);
		expect(toastMock.error).not.toHaveBeenCalled();
		expect((error as { __toastShown?: boolean }).__toastShown).toBe(false);
	});

	it("uses a specific 404 fallback instead of a bare 请求失败", async () => {
		const error = httpError(404, undefined);
		await expect(rejectHandler(error)).rejects.toBe(error);
		expect(toastMock.error).toHaveBeenCalledWith("请求的接口不存在（404）");
	});

	it("translates a known backend message into Chinese", async () => {
		const error = httpError(400, { msg: "room is full (3/10)" });
		await expect(rejectHandler(error)).rejects.toBe(error);
		expect(toastMock.error).toHaveBeenCalledWith("房间已满");
	});

	it("throttles repeated identical failures from polling", async () => {
		const first = httpError(404, undefined);
		const second = httpError(404, undefined);
		const third = httpError(404, undefined);
		await rejectHandler(first).catch(() => {});
		await rejectHandler(second).catch(() => {});
		await rejectHandler(third).catch(() => {});
		expect(toastMock.error).toHaveBeenCalledTimes(1);
	});
});
