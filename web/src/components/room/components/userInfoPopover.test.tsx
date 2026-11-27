import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	query: { data: undefined as unknown, isLoading: true, isError: false },
}));

vi.mock("@tanstack/react-query", () => ({
	useQuery: () => mocks.query,
}));
vi.mock("@/api/user", () => ({ fetchUserInfo: vi.fn() }));

import UserInfoPopover from "./userInfoPopover";

const reset = () => {
	mocks.query = { data: undefined, isLoading: true, isError: false };
};

afterEach(() => {
	cleanup();
	reset();
});

describe("UserInfoPopover 首帧", () => {
	it("有列表资料时直接渲染成员资料，不闪加载骨架", () => {
		render(
			<UserInfoPopover
				identity="alice"
				pos={{ x: 100, y: 100 }}
				onClose={() => {}}
				initialMember={{
					display_name: "爱丽丝",
					name: "alice",
					avatar: "",
				}}
			/>,
		);

		expect(screen.getByText("爱丽丝")).toBeTruthy();
		expect(screen.getByText("@alice")).toBeTruthy();
		expect(screen.queryByLabelText("正在加载用户信息")).toBeNull();
	});

	it("首帧位置即为最终位置，含偏移且不做二次跳变", () => {
		render(
			<UserInfoPopover
				identity="alice"
				pos={{ x: 100, y: 100 }}
				onClose={() => {}}
				initialMember={{ display_name: "爱丽丝", name: "alice" }}
			/>,
		);

		const card = screen.getByText("爱丽丝").closest(".z-dialog") as HTMLElement;
		expect(card.style.left).toBe("108px");
		expect(card.style.top).toBe("108px");
	});

	it("通过 portal 挂到 body，避免被侧栏 overflow-hidden / backdrop-filter 裁切", () => {
		const { container } = render(
			<UserInfoPopover
				identity="alice"
				pos={{ x: 100, y: 100 }}
				onClose={() => {}}
				initialMember={{ display_name: "爱丽丝", name: "alice" }}
			/>,
		);

		const card = screen.getByText("爱丽丝").closest(".z-dialog") as HTMLElement;
		expect(card).toBeTruthy();
		expect(container.contains(card)).toBe(false);
		expect(card.parentElement).toBe(document.body);
	});

	it("接口数据返回后以权威资料覆盖首帧内容", () => {
		mocks.query = {
			data: {
				id: 1,
				name: "alice",
				display_name: "权威昵称",
				avatar: "/uploads/a.png",
				role: "admin",
			},
			isLoading: false,
			isError: false,
		};
		render(
			<UserInfoPopover
				identity="alice"
				pos={{ x: 100, y: 100 }}
				onClose={() => {}}
				initialMember={{ display_name: "首帧昵称", name: "alice" }}
			/>,
		);

		expect(screen.getByText("权威昵称")).toBeTruthy();
		expect(screen.getByText("admin")).toBeTruthy();
	});
});
