import { renderHook, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { reportPushToken } from "@/api/pushRegistration";
import { useMobilePush } from "./useMobilePush";

vi.mock("@gospeak/mobile-capabilities", () => ({
	inMobile: () => true,
	createPush: () => ({
		register: vi.fn().mockResolvedValue("tok-1"),
		onToken: vi.fn((h) => {
			h("tok-1");
			return () => {};
		}),
		onNotificationOpened: vi.fn(() => () => {}),
	}),
}));
vi.mock("@/api/pushRegistration", () => ({
	reportPushToken: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ navigate: vi.fn() }),
}));

test("移动端注册 push 并上报 token", async () => {
	renderHook(() => useMobilePush());
	await waitFor(() => expect(reportPushToken).toHaveBeenCalledWith("tok-1"));
});
