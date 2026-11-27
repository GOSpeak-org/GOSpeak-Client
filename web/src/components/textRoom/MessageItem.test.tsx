import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MessageDTO } from "@/types/message";
import MessageItem from "./MessageItem";

const msg: MessageDTO = {
	uuid: "m-1",
	room_uuid: "r-1",
	author_id: "alice",
	author_uuid: "u-alice",
	author_name: "Alice",
	author_avatar: "",
	content: "hello",
	deleted: false,
	created_at: new Date().toISOString(),
};

function actionBarOf(name: string): HTMLElement {
	const button = screen.getByRole("button", { name });
	const bar = button.parentElement;
	if (!bar) throw new Error("action bar not found");
	return bar;
}

describe("MessageItem 操作条", () => {
	afterEach(() => {
		cleanup();
	});

	it("触屏上是常驻入口：点开、再点收起", () => {
		render(<MessageItem msg={msg} coarsePointer />);
		const bar = actionBarOf("回复");
		expect(bar.className).toContain("opacity-0");
		expect(bar.className).toContain("pointer-events-none");
		expect(bar.className).not.toContain("invisible");

		fireEvent.click(screen.getByRole("button", { name: "消息操作" }));
		expect(bar.className).toContain("opacity-100");
		expect(bar.className).toContain("pointer-events-auto");

		fireEvent.click(screen.getByRole("button", { name: "消息操作" }));
		expect(bar.className).toContain("opacity-0");
		expect(bar.className).toContain("pointer-events-none");
	});

	it("桌面用 opacity + group-hover/group-focus-within 显示，且操作条不越出列表边界", () => {
		render(<MessageItem msg={msg} coarsePointer={false} />);
		const bar = actionBarOf("回复");
		expect(bar.className).toContain("group-hover:opacity-100");
		expect(bar.className).toContain("group-focus-within:opacity-100");
		expect(bar.className).toContain("group-hover:pointer-events-auto");
		expect(bar.className).toContain("group-focus-within:pointer-events-auto");
		expect(bar.className).not.toContain("invisible");
		expect(bar.className).not.toContain("group-hover:visible");
		expect(bar.className).not.toContain("-top-4");
		expect(bar.className).toContain("top-1");
		expect(screen.queryByRole("button", { name: "消息操作" })).toBeNull();
	});

	it("操作条图标按钮带 aria-label，键盘可定位", () => {
		render(<MessageItem msg={msg} coarsePointer={false} />);
		for (const name of ["回复", "打开线程"]) {
			expect(
				screen.getByRole("button", { name }).getAttribute("aria-label"),
			).toBe(name);
		}
	});
});
