import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberRoster } from "@/hooks/useMemberRoster";
import MemberSidebar from "./memberSidebar";

const mocks = vi.hoisted(() => ({
	roster: {} as MemberRoster,
}));

vi.mock("@/hooks/useMemberRoster", () => ({
	useMemberRoster: () => mocks.roster,
}));
vi.mock("./userInfoPopover", () => ({ default: () => null }));

const online = {
	identity: "alice",
	user_uuid: "uuid-alice",
	name: "alice",
	display_name: "Alice",
	avatar: "",
	online: true,
	is_me: false,
	is_mic_muted: true,
	is_muted: false,
};

const offline = {
	identity: "bob",
	user_uuid: "uuid-bob",
	name: "bob",
	display_name: "Bob",
	avatar: "",
	online: false,
	is_me: true,
	is_mic_muted: false,
	is_muted: false,
};

afterEach(cleanup);

describe("MemberSidebar / 全量成员分组", () => {
	it("在线与离线分组展示，计数含全部成员", () => {
		mocks.roster = {
			online: [online],
			offline: [offline],
			total: 2,
			loading: false,
		};
		render(<MemberSidebar />);

		expect(screen.getByText("成员 (2)")).toBeTruthy();
		expect(screen.getByText("在线")).toBeTruthy();
		expect(screen.getAllByText("— 1")).toHaveLength(2);
		expect(screen.getByText("Alice")).toBeTruthy();
		expect(screen.getByText("Bob")).toBeTruthy();
		// 分组标题 + 行内离线标记
		expect(screen.getAllByText("离线")).toHaveLength(2);
	});

	it("无离线成员时不渲染离线分组", () => {
		mocks.roster = {
			online: [online],
			offline: [],
			total: 1,
			loading: false,
		};
		render(<MemberSidebar />);

		expect(screen.queryByText("离线")).toBeNull();
	});

	it("成员为空时显示空状态", () => {
		mocks.roster = { online: [], offline: [], total: 0, loading: false };
		render(<MemberSidebar />);

		expect(screen.getByText("暂无成员")).toBeTruthy();
	});
});
