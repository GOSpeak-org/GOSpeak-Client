import { beforeEach, describe, expect, it } from "vitest";
import { useUserStore, type UserInfo } from "@/stores/userStore";
import {
	MANAGE_ENTRY_PERMISSIONS,
	hasManageAccess,
	hasPermission,
} from "./permissions";

function setUser(overrides: Partial<UserInfo>) {
	useUserStore.setState({
		user: {
			id: 1,
			uuid: "u-1",
			name: "alice",
			display_name: "Alice",
			avatar: "",
			role: "user",
			...overrides,
		},
		userStale: false,
	});
}

describe("permissions are server-authoritative", () => {
	beforeEach(() => {
		useUserStore.setState({ user: null, userStale: false });
	});

	it("never derives permissions from the role name", () => {
		setUser({ role: "admin" });
		expect(hasPermission("user:read")).toBe(false);
		expect(hasManageAccess()).toBe(false);

		setUser({ role: "user" });
		expect(hasPermission("room:create")).toBe(false);
		expect(hasManageAccess()).toBe(false);
	});

	it("honors exactly the codes delivered by the server", () => {
		setUser({ permissions: ["user:read", "message:send"] });
		expect(hasPermission("user:read")).toBe(true);
		expect(hasPermission("message:send")).toBe(true);
		expect(hasPermission("domain:create")).toBe(false);
		expect(hasPermission("room:read")).toBe(false);
	});

	it("lets newly added backend codes through without any frontend change", () => {
		setUser({ permissions: ["domain:room-layout:manage"] });
		expect(hasPermission("domain:room-layout:manage")).toBe(true);
	});

	it("drives the manage entry from delivered permissions", () => {
		setUser({ permissions: ["domain:read"] });
		expect(hasManageAccess()).toBe(true);
		expect(MANAGE_ENTRY_PERMISSIONS.some((code) => hasPermission(code))).toBe(
			true,
		);

		setUser({ permissions: ["room:create"] });
		expect(hasManageAccess()).toBe(false);
	});

	it("denies banned users even with leftover permissions", () => {
		setUser({ role: "ban", permissions: ["user:read", "room:read"] });
		expect(hasManageAccess()).toBe(false);
		expect(hasPermission("room:read")).toBe(false);
	});

	it("denies everything without a user", () => {
		expect(hasPermission("room:read")).toBe(false);
		expect(hasManageAccess()).toBe(false);
	});
});
