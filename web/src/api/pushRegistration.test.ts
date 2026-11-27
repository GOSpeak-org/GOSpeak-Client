import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());
const inMobile = vi.hoisted(() => vi.fn(() => false));

vi.mock("@/api/apiClient", () => ({ default: { post } }));
vi.mock("@gospeak/mobile-capabilities", () => ({ inMobile }));

import {
	defaultPushTokenReporter,
	reportPushToken,
	setPushTokenReporter,
} from "./pushRegistration";

let infoSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	post.mockReset();
	inMobile.mockReturnValue(false);
	setPushTokenReporter(defaultPushTokenReporter);
	infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
	infoSpy.mockRestore();
});

describe("reportPushToken", () => {
	it("默认 reporter 把 token 静默上报到后端", async () => {
		post.mockResolvedValue(null);

		await reportPushToken("token-abc");

		expect(post).toHaveBeenCalledWith(
			expect.objectContaining({
				url: "/api/v1/user/push-token",
				data: { token: "token-abc", platform: "web" },
				silentError: true,
			}),
		);
	});

	it("移动端上报 platform=mobile", async () => {
		inMobile.mockReturnValue(true);
		post.mockResolvedValue(null);

		await reportPushToken("token-mobile");

		expect(post).toHaveBeenCalledWith(
			expect.objectContaining({
				data: { token: "token-mobile", platform: "mobile" },
			}),
		);
	});

	it("后端失败不抛错，只记日志", async () => {
		post.mockRejectedValue(new Error("offline"));

		await expect(reportPushToken("token-abc")).resolves.toBeUndefined();
		expect(infoSpy).toHaveBeenCalledWith(
			"[push] token 上报失败",
			expect.any(Error),
		);
	});

	it("注入的 reporter 覆盖默认实现，且抛错不外溢", async () => {
		const custom = vi.fn().mockRejectedValue(new Error("boom"));
		setPushTokenReporter(custom);

		await expect(reportPushToken("token-custom")).resolves.toBeUndefined();
		expect(custom).toHaveBeenCalledWith("token-custom");
		expect(post).not.toHaveBeenCalled();
	});

	it("未配置 reporter 时不抛错也不发请求", async () => {
		setPushTokenReporter(null as unknown as typeof defaultPushTokenReporter);

		await expect(
			reportPushToken("token-unconfigured"),
		).resolves.toBeUndefined();
		expect(post).not.toHaveBeenCalled();
		expect(infoSpy).toHaveBeenCalledWith("[push] token 上报未配置", "token-");
	});
});
