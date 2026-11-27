import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInstance = vi.hoisted(() => {
	// axiosInstance in apiClient is invoked as a function on the retry path.
	const instance = vi.fn() as ReturnType<typeof vi.fn> & {
		interceptors: {
			request: { use: ReturnType<typeof vi.fn> };
			response: { use: ReturnType<typeof vi.fn> };
		};
		request: ReturnType<typeof vi.fn>;
	};
	instance.interceptors = {
		request: { use: vi.fn() },
		response: { use: vi.fn() },
	};
	instance.request = vi.fn();
	return { instance };
});

const refreshMock = vi.hoisted(() => vi.fn());
const clearCacheMock = vi.hoisted(() => vi.fn());

vi.mock("axios", () => ({
	default: { create: vi.fn(() => mockInstance.instance) },
}));
vi.mock("@gospeak/components", () => ({
	toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
vi.mock("@/api/authTransport", () => ({
	refreshSession: (...args: unknown[]) => refreshMock(...args),
}));
vi.mock("@/api/sessionCache", () => ({
	clearSessionCache: (...args: unknown[]) => clearCacheMock(...args),
}));

import "./apiClient";

const rejectHandler = vi.mocked(mockInstance.instance.interceptors.response.use)
	.mock.calls[0][1] as (error: unknown) => Promise<unknown>;

const tokenError = (
	config: Record<string, unknown> = {},
	data: { code?: number; msg?: string } = {
		code: 1001,
		msg: "token does not exist",
	},
) => ({ config, response: { status: 401, data } });

describe("apiClient auth-failure redirect", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("clears cached session when token errors exhaust refresh (breaks login/app bounce loop)", async () => {
		refreshMock.mockRejectedValueOnce({ response: { data: { code: 1001 } } });

		await expect(rejectHandler(tokenError())).rejects.toBeDefined();

		expect(clearCacheMock).toHaveBeenCalledTimes(1);
	});

	it("does NOT clear cache when refresh succeeds (silent refresh keeps session)", async () => {
		mockInstance.instance.mockResolvedValueOnce({
			data: { code: 0, msg: "success", data: {} },
			status: 200,
			config: {},
		});
		refreshMock.mockResolvedValueOnce(900);

		await expect(rejectHandler(tokenError())).resolves.toBeDefined();

		expect(clearCacheMock).not.toHaveBeenCalled();
	});

	it("clears cache on a repeated token error where retry was already attempted", async () => {
		await expect(
			rejectHandler(tokenError({ _retry: true })),
		).rejects.toBeDefined();

		expect(clearCacheMock).toHaveBeenCalledTimes(1);
	});
});
