import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	hasDomainPermission: vi.fn((_domainUUID: string, _code: string) => false),
	currentUserName: "alice" as string | undefined,
}));

vi.mock("@/utils/domainPermissions", () => ({
	hasDomainPermission: mocks.hasDomainPermission,
}));
vi.mock("@/stores/userStore", () => ({
	useUserStore: Object.assign(
		(selector: (s: unknown) => unknown) =>
			selector({ user: { name: mocks.currentUserName } }),
		{ getState: () => ({ user: { name: mocks.currentUserName } }) },
	),
}));

import { canManageRoom } from "./roomPermissions";

describe("canManageRoom (mirrors server canManageRoom)", () => {
	beforeEach(() => {
		mocks.hasDomainPermission.mockReturnValue(false);
		mocks.currentUserName = "alice";
	});

	it("grants domain role permission", () => {
		mocks.hasDomainPermission.mockReturnValue(true);
		expect(
			canManageRoom(
				{ name: "x", domain_uuid: "d1", created_by: "bob" },
				"room:update",
			),
		).toBe(true);
		expect(mocks.hasDomainPermission).toHaveBeenCalledWith("d1", "room:update");
	});

	it("grants creator even without permission", () => {
		expect(
			canManageRoom(
				{ name: "x", domain_uuid: "d1", created_by: "alice" },
				"room:delete",
			),
		).toBe(true);
	});

	it("denies non-creator without permission", () => {
		expect(
			canManageRoom(
				{ name: "x", domain_uuid: "d1", created_by: "bob" },
				"room:delete",
			),
		).toBe(false);
	});

	it("denies missing created_by", () => {
		expect(canManageRoom({ name: "x", domain_uuid: "d1" }, "room:update")).toBe(
			false,
		);
	});

	it("does not use global permission or hardcoded admin role", () => {
		expect(
			canManageRoom(
				{ name: "x", domain_uuid: "d1", created_by: "bob" },
				"room:update",
			),
		).toBe(false);
	});
});
