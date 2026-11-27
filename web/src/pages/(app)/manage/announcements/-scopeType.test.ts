import { describe, expect, it, vi } from "vitest";

vi.mock("@gospeak/components", () => ({
	Button: () => null,
	Input: () => null,
	Switch: () => null,
	Skeleton: () => null,
	toast: Object.assign(vi.fn(), {
		success: vi.fn(),
		error: vi.fn(),
		warning: vi.fn(),
	}),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => () => ({}),
}));

vi.mock("@/utils/permissions", () => ({ hasPermission: () => false }));

import { defaultScopeType } from "./index";

describe("公告默认范围", () => {
	it("平台管理员默认全站，域管理员默认指定域", () => {
		expect(defaultScopeType(true)).toBe("platform");
		expect(defaultScopeType(false)).toBe("domain");
	});
});
