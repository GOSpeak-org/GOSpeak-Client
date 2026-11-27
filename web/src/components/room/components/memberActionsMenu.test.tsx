import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	permissions: [] as string[],
	kickMember: vi.fn(),
	createMute: vi.fn(),
}));

vi.mock("@/utils/permissions", () => ({
	hasPermission: (code: string) => mocks.permissions.includes(code),
}));
vi.mock("@/stores/socketStore", () => ({
	socketStore: { kickMember: mocks.kickMember },
}));
vi.mock("@/api/mute", () => ({ createMute: mocks.createMute }));
vi.mock("@tanstack/react-query", () => ({
	useMutation: ({ mutationFn }: { mutationFn: () => Promise<unknown> }) => ({
		mutate: () => void mutationFn(),
		isPending: false,
	}),
}));

import MemberActionsMenu from "./memberActionsMenu";

beforeEach(() => {
	mocks.permissions = [];
	mocks.kickMember.mockReset();
	mocks.createMute.mockReset();
});
afterEach(cleanup);

const baseProps = {
	userUUID: "user-uuid-alice",
	displayName: "Alice",
	isSelf: false,
	room: "lobby",
	pos: { x: 100, y: 100 },
	onClose: () => {},
};

describe("MemberActionsMenu 权限与操作", () => {
	it("无权限时不渲染任何操作项", () => {
		render(<MemberActionsMenu {...baseProps} />);
		expect(screen.queryByText("踢出房间")).toBeNull();
		expect(screen.queryByText("禁言")).toBeNull();
	});

	it("自己不显示踢出与禁言项", () => {
		mocks.permissions = ["signal:kick", "mute:manage"];
		render(<MemberActionsMenu {...baseProps} isSelf={true} />);
		expect(screen.queryByText("踢出房间")).toBeNull();
		expect(screen.queryByText("禁言")).toBeNull();
	});

	it("踢出权限显示踢出项，点击确认后调用 kickMember", () => {
		mocks.permissions = ["signal:kick"];
		render(<MemberActionsMenu {...baseProps} />);
		fireEvent.click(screen.getByText("踢出房间"));
		fireEvent.click(screen.getByRole("button", { name: "踢出" }));
		expect(mocks.kickMember).toHaveBeenCalledWith("lobby", "user-uuid-alice");
	});

	it("禁言权限显示禁言项，提交时直接用 user_uuid 调用禁言 API", async () => {
		mocks.permissions = ["mute:manage"];
		mocks.createMute.mockResolvedValue({});
		render(<MemberActionsMenu {...baseProps} />);
		fireEvent.click(screen.getByText("禁言"));
		expect(screen.getByText("禁言成员")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "禁言" }));
		await vi.waitFor(() => {
			expect(mocks.createMute).toHaveBeenCalledWith(
				expect.objectContaining({ user_uuid: "user-uuid-alice" }),
			);
		});
	});
});
