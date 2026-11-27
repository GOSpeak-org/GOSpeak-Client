import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberRoster, RosterMember } from "@/hooks/useMemberRoster";
import { useSocketStore } from "@/stores/socketStore";
import MemberSidebar from "./memberSidebar";

const mocks = vi.hoisted(() => ({
	roster: { online: [], offline: [], total: 0, loading: false } as MemberRoster,
}));

vi.mock("@/hooks/useMemberRoster", () => ({
	useMemberRoster: () => mocks.roster,
}));

const alice: RosterMember = {
	identity: "alice",
	user_uuid: "uuid-alice",
	name: "alice",
	display_name: "Alice",
	avatar: "",
	online: true,
	is_me: false,
	is_mic_muted: false,
	is_muted: false,
};

afterEach(() => {
	cleanup();
	useSocketStore.setState({ connected: false });
});

describe("MemberSidebar 选中态", () => {
	it("点击成员后出现可见选中态，并回调 onStartChat", () => {
		mocks.roster = { online: [alice], offline: [], total: 1, loading: false };
		useSocketStore.setState({ connected: true });
		const onStartChat = vi.fn();

		render(<MemberSidebar onStartChat={onStartChat} />);
		const row = screen.getByText("Alice").closest("button");
		if (!row) throw new Error("member row not found");
		expect(row.getAttribute("data-active")).not.toBe("true");

		fireEvent.click(row);
		expect(onStartChat).toHaveBeenCalledWith("alice", "Alice", "");
		expect(row.getAttribute("data-active")).toBe("true");
		expect(row.className).toContain("bg-muted");
	});
});
