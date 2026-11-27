import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/stores/chatStore";
import { useSocketStore, type RoomInfo } from "@/stores/socketStore";
import { useTextRoomUiStore } from "@/stores/textRoomUiStore";
import MessageInput from "./MessageInput";

vi.mock("@/hooks/useTypingReporter", () => ({
	useTypingReporter: () => ({ notify: () => {}, stop: () => {} }),
}));
vi.mock("@/hooks/useUpload", () => ({
	useUpload: () => ({
		upload: async () => ({ public_url: "" }),
		uploading: false,
		progress: 0,
	}),
}));

const room: RoomInfo = {
	id: 1,
	uuid: "r-1",
	name: "general",
	has_password: false,
	limit: 50,
	count: 2,
	members: [
		{
			id: "1",
			identity: "alice",
			name: "alice",
			display_name: "Alice",
			avatar: "",
			is_muted: false,
			is_mic_muted: false,
			joined_at: 0,
		},
		{
			id: "2",
			identity: "bob",
			name: "bob",
			display_name: "Bob",
			avatar: "",
			is_muted: false,
			is_mic_muted: false,
			joined_at: 0,
		},
	],
};

function openMention(value: string): HTMLTextAreaElement {
	const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
	fireEvent.input(textarea, { target: { value } });
	return textarea;
}

beforeEach(() => {
	useChatStore.setState({ textRoomName: "general", textRoomDomainUUID: null });
	useSocketStore.setState({ rooms: [room] });
	useTextRoomUiStore.setState({ replyTo: null, threadParent: null });
});

afterEach(() => {
	cleanup();
});

describe("MessageInput @提及候选", () => {
	it("候选列表使用 listbox/option 语义并标记当前项", () => {
		render(<MessageInput />);
		openMention("@");

		expect(screen.getByRole("listbox")).toBeTruthy();
		const options = screen.getAllByRole("option");
		expect(options).toHaveLength(2);
		expect(options[0].getAttribute("aria-selected")).toBe("true");
		expect(options[1].getAttribute("aria-selected")).toBe("false");
	});

	it("Escape 关闭候选列表", () => {
		render(<MessageInput />);
		const textarea = openMention("@");
		expect(screen.queryByRole("listbox")).not.toBeNull();

		fireEvent.keyDown(textarea, { key: "Escape" });
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("点击候选与输入框之外关闭候选列表", () => {
		render(<MessageInput />);
		openMention("@");
		fireEvent.mouseDown(document.body);
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("滚动时关闭候选列表", () => {
		render(<MessageInput />);
		openMention("@");
		fireEvent.scroll(document.body);
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("窗口 resize 时关闭候选列表", () => {
		render(<MessageInput />);
		openMention("@");
		fireEvent(window, new Event("resize"));
		expect(screen.queryByRole("listbox")).toBeNull();
	});
});

describe("MessageInput 线程回复", () => {
	it("线程里的取消按钮调用 exitThread，而不是只清 replyTo", () => {
		useTextRoomUiStore.setState({ threadParent: "m-1", replyTo: "m-2" });
		render(<MessageInput />);
		expect(screen.getByText("回复到线程")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "取消回复" }));
		const state = useTextRoomUiStore.getState();
		expect(state.threadParent).toBeNull();
		expect(state.replyTo).toBeNull();
	});
});
