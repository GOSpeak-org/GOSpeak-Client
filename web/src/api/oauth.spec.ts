import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/apiClient", () => {
	const mockGet = vi.fn();
	return { default: { get: mockGet }, mockGet };
});

import apiClient from "@/api/apiClient";
import { getEnabledProviders } from "@/api/oauth";

const getMock = vi.mocked(apiClient.get);

describe("oauthApi", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("getEnabledProviders stays silent when the backend is offline", async () => {
		getMock.mockResolvedValueOnce([] as never);
		await getEnabledProviders();
		expect(getMock).toHaveBeenCalledWith({
			url: "/api/v1/oauth/providers",
			skipErrorToast: true,
		});
	});
});
