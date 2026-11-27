import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import RoomDetail from "./roomDetail";

class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
	value: ResizeObserverStub,
	writable: true,
});

Object.defineProperty(HTMLMediaElement.prototype, "play", {
	configurable: true,
	value: vi.fn().mockResolvedValue(undefined),
});

const mocks = vi.hoisted(() => ({
	setMemberOutputVolume: vi.fn(),
	setMemberMute: vi.fn(),
	hasPermission: vi.fn((_code?: string) => false),
	socketStoreCurrentRoom: vi.fn((): string | null => null),
	kickMember: vi.fn(),
	createMute: vi.fn(),
	fetchUserInfo: vi.fn(),
	toastActionError: vi.fn(),
	socket: {
		rooms: [] as Array<{
			name: string;
			domain_uuid: string | null;
			members: Array<Record<string, unknown>>;
		}>,
		currentRoom: "测试" as string | null,
	},
	voice: {
		otherMemberState: {} as Record<
			string,
			{ outputVolume: number; isMute: boolean }
		>,
	},
	share: {
		remote: [] as Array<{
			identity: string;
			source: "screen" | "camera";
			track: unknown;
		}>,
		remotePublications: [] as Array<{
			identity: string;
			source: "screen";
		}>,
		localSharing: false,
		localTrack: null as unknown,
	},
	watchScreenShare: vi.fn(() => Promise.resolve()),
	stopWatchingScreenShare: vi.fn(),
}));

/**
 * 加入中 / 失败状态必须作为房间面板自身的内容渲染（0.4.0 的做法），
 * 不能是盖在面板上的浮层卡片 —— 之前那版有 bg-muted + border + shadow-xl，
 * 看起来像弹窗，实际面板里什么都没有。
 */
const session = {
	selectedRoom: { name: "测试", domain_uuid: null },
	phase: "joining_media" as string,
	phaseLabel: "连接媒体...",
	isJoined: false,
	isReconnecting: false,
	isLoading: true,
	error: null as string | null,
	retry: vi.fn(),
};

vi.mock("./VoiceSessionProvider", () => ({
	useVoiceSessionContext: () => session,
}));
// 密码弹窗会连带加载 chatStore/私聊处理器，与本用例无关。
vi.mock("@/components/room/components/passwordModal", () => ({
	default: () => null,
}));
vi.mock("@/stores/socketStore", () => ({
	useSocketStore: (selector: (s: unknown) => unknown) => selector(mocks.socket),
	socketStore: {
		currentDomainUUID: () => null,
		currentRoom: mocks.socketStoreCurrentRoom,
		kickMember: mocks.kickMember,
	},
}));
vi.mock("@/stores/userStore", () => {
	const hook = (selector: (s: unknown) => unknown) =>
		selector({ user: { name: "me" } });
	Object.assign(hook, { getState: () => ({ user: { name: "me" } }) });
	return { useUserStore: hook, default: hook };
});
vi.mock("@/stores/voiceChatStore", () => ({
	useVoiceChatStore: (selector: (s: unknown) => unknown) =>
		selector(mocks.voice),
	useVoiceChatActions: () => ({
		setMemberOutputVolume: mocks.setMemberOutputVolume,
		setMemberMute: mocks.setMemberMute,
	}),
}));
vi.mock("@/utils/permissions", () => ({
	hasPermission: (code: string) => mocks.hasPermission(code),
}));
vi.mock("@/api/mute", () => ({ createMute: mocks.createMute }));
vi.mock("@/api/user", () => ({ fetchUserInfo: mocks.fetchUserInfo }));
vi.mock("@/utils/toast", () => ({ toastActionError: mocks.toastActionError }));
// 二次确认弹窗本身不改动；这里只验证「踢出房间」确实经过确认步骤。
vi.mock("@/components/common/ConfirmModal", () => ({
	default: ({
		open,
		title,
		message,
		confirmText,
		onConfirm,
		onClose,
	}: {
		open: boolean;
		title?: string;
		message: ReactNode;
		confirmText?: string;
		onConfirm: () => void;
		onClose: () => void;
	}) =>
		open ? (
			<div role="dialog" aria-label={title}>
				{message}
				<button type="button" onClick={onClose}>
					取消
				</button>
				<button type="button" onClick={onConfirm}>
					{confirmText}
				</button>
			</div>
		) : null,
}));
vi.mock("@/handler_audio", () => ({
	setMutedByIdentity: vi.fn(),
	setVolumeByIdentity: vi.fn(),
}));
vi.mock("@/handler_audio/speakingStore", () => ({
	useSpeakingStore: (selector: (s: unknown) => unknown) =>
		selector({ speakingIdentities: [] }),
}));
vi.mock("@/stores/screenShareStore", () => ({
	useScreenShareStore: (selector: (s: unknown) => unknown) =>
		selector(mocks.share),
}));
vi.mock("./useWatchScreenShare", () => ({
	useWatchScreenShare: () => ({
		watchScreenShare: mocks.watchScreenShare,
		stopWatchingScreenShare: mocks.stopWatchingScreenShare,
	}),
}));

function reset(overrides: Partial<typeof session> = {}) {
	Object.assign(session, {
		phase: "joining_media",
		phaseLabel: "连接媒体...",
		isJoined: false,
		isLoading: true,
		error: null,
		...overrides,
	});
}

const meMember = {
	id: "1",
	user_uuid: "user-uuid-me",
	identity: "me",
	name: "me",
	display_name: "我",
	avatar: "",
	is_muted: false,
	is_mic_muted: false,
	joined_at: 0,
};

const bob = {
	id: "2",
	user_uuid: "user-uuid-bob",
	identity: "bob",
	name: "bob",
	display_name: "Bob",
	avatar: "",
	is_muted: false,
	is_mic_muted: false,
	joined_at: 0,
};

function joinWithMembers() {
	reset({
		phase: "ready",
		phaseLabel: "已连接",
		isJoined: true,
		isLoading: false,
	});
	mocks.socket.rooms = [{ name: "测试", domain_uuid: null, members: [bob] }];
}

beforeEach(() => {
	mocks.socket.rooms = [];
	mocks.socket.currentRoom = "测试";
	mocks.socketStoreCurrentRoom.mockReturnValue("测试");
	mocks.hasPermission.mockReturnValue(false);
	mocks.fetchUserInfo.mockReset();
	mocks.createMute.mockReset();
	mocks.watchScreenShare.mockReset();
	mocks.watchScreenShare.mockImplementation(() => Promise.resolve());
	mocks.voice.otherMemberState = {};
	mocks.share.remote = [];
	mocks.share.remotePublications = [];
	mocks.share.localSharing = false;
	mocks.share.localTrack = null;
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("RoomDetail / 加入状态渲染在面板内", () => {
	it("加载态直接铺在面板里，没有浮层卡片", () => {
		reset();
		const { container } = render(<RoomDetail />);

		expect(screen.getByText("测试")).toBeTruthy();
		expect(screen.getByText("连接媒体...")).toBeTruthy();
		// 旧的浮层是 absolute inset-0 + 圆角卡片 + 阴影
		expect(container.querySelector(".shadow-xl")).toBeNull();
		expect(container.querySelector('[class*="inset-0"]')).toBeNull();
	});

	it("失败态给出原因和重试按钮", () => {
		reset({
			phase: "failed",
			phaseLabel: "加入失败",
			isLoading: false,
			error: "socket connect timeout",
		});
		render(<RoomDetail />);

		expect(screen.getByText("socket connect timeout")).toBeTruthy();
		expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
		// 不是密码错误，不应出现重新输入密码
		expect(screen.queryByRole("button", { name: "重新输入密码" })).toBeNull();
	});

	it("已加入但没有成员时提示等待，而不是继续显示加载态", () => {
		reset({
			phase: "ready",
			phaseLabel: "已连接",
			isJoined: true,
			isLoading: false,
		});
		render(<RoomDetail />);

		expect(screen.getByText("已连接，等待成员加入")).toBeTruthy();
		expect(screen.queryByText("连接媒体...")).toBeNull();
	});
});

describe("RoomDetail / 成员卡片音量控件", () => {
	it("静音时音量行仍然可见，滑块禁用", () => {
		joinWithMembers();
		mocks.voice.otherMemberState = {
			bob: { outputVolume: 60, isMute: true },
		};
		render(<RoomDetail />);

		expect(screen.getByText("60%")).toBeTruthy();
		expect(screen.getByRole("button", { name: "取消静音" })).toBeTruthy();
		const slider = screen.getByRole("slider");
		expect(slider.getAttribute("aria-valuenow")).toBe("60");
		expect(slider.getAttribute("data-disabled")).toBe("");
	});

	it("点击百分比把音量恢复到 100", () => {
		joinWithMembers();
		mocks.voice.otherMemberState = {
			bob: { outputVolume: 60, isMute: false },
		};
		render(<RoomDetail />);

		fireEvent.click(screen.getByRole("button", { name: /60%/ }));

		expect(mocks.setMemberOutputVolume).toHaveBeenCalledWith("bob", 100);
	});

	it("点击音量图标切换静音，与成员操作菜单双写一致", () => {
		joinWithMembers();
		mocks.voice.otherMemberState = {
			bob: { outputVolume: 60, isMute: false },
		};
		render(<RoomDetail />);

		fireEvent.click(screen.getByRole("button", { name: "静音" }));

		expect(mocks.setMemberMute).toHaveBeenCalledWith("bob", true);
	});
});

/** Radix DropdownMenu 在 pointerdown 打开，jsdom 下需显式派发。 */
const openMemberMenu = (trigger: HTMLElement) =>
	fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

describe("RoomDetail / 成员卡片更多操作菜单", () => {
	it("点击 ... 展开菜单，再点收起", () => {
		joinWithMembers();
		render(<RoomDetail />);
		const trigger = screen.getByRole("button", { name: /更多操作/ });

		expect(screen.queryByRole("menu")).toBeNull();
		openMemberMenu(trigger);
		expect(screen.getByRole("menu")).toBeTruthy();
		expect(trigger.getAttribute("aria-expanded")).toBe("true");

		openMemberMenu(trigger);
		expect(screen.queryByRole("menu")).toBeNull();
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
	});

	it("菜单通过 portal 渲染在 overflow-hidden 卡片之外，并使用 z token", () => {
		joinWithMembers();
		const { container } = render(<RoomDetail />);
		openMemberMenu(screen.getByRole("button", { name: /更多操作/ }));

		const menu = screen.getByRole("menu");
		const card = container.querySelector(".overflow-hidden");
		expect(card?.contains(menu)).toBe(false);
		expect(menu.className).toContain("z-popover");
	});

	it("按 Esc 关闭菜单", () => {
		joinWithMembers();
		render(<RoomDetail />);
		const trigger = screen.getByRole("button", { name: /更多操作/ });

		openMemberMenu(trigger);
		expect(screen.getByRole("menu")).toBeTruthy();
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("menu")).toBeNull();
	});

	it("菜单浮层使用 Radix portal（外部点击/scroll/resize 关闭由原语保证）", () => {
		joinWithMembers();
		render(<RoomDetail />);
		openMemberMenu(screen.getByRole("button", { name: /更多操作/ }));

		const menu = screen.getByRole("menu");
		expect(menu.closest("[data-radix-popper-content-wrapper]")).toBeTruthy();
		expect(menu.className).toContain("z-popover");
	});

	it("同一时刻只展开一个菜单", () => {
		reset({
			phase: "ready",
			phaseLabel: "已连接",
			isJoined: true,
			isLoading: false,
		});
		mocks.socket.rooms = [
			{
				name: "测试",
				domain_uuid: null,
				members: [
					bob,
					{
						...bob,
						id: "3",
						identity: "alice",
						name: "alice",
						display_name: "Alice",
					},
				],
			},
		];
		render(<RoomDetail />);
		const triggers = screen.getAllByRole("button", { name: /更多操作/ });
		expect(triggers.length).toBe(2);

		openMemberMenu(triggers[0]);
		expect(screen.getAllByRole("menu").length).toBe(1);
		openMemberMenu(triggers[1]);
		expect(screen.getAllByRole("menu").length).toBe(1);
		expect(triggers[0].getAttribute("aria-expanded")).toBe("false");
		expect(triggers[1].getAttribute("aria-expanded")).toBe("true");
	});

	it("无 signal:kick 权限时不显示踢出房间，但保留静音", () => {
		joinWithMembers();
		render(<RoomDetail />);
		openMemberMenu(screen.getByRole("button", { name: /更多操作/ }));

		expect(screen.getByRole("menuitem", { name: "静音" })).toBeTruthy();
		expect(screen.queryByRole("menuitem", { name: "踢出房间" })).toBeNull();
	});

	it("有权限时踢出房间走二次确认，确认后才调用 kickMember", () => {
		joinWithMembers();
		mocks.hasPermission.mockImplementation(
			(code?: string) => code === "signal:kick",
		);
		render(<RoomDetail />);

		openMemberMenu(screen.getByRole("button", { name: /更多操作/ }));
		fireEvent.click(screen.getByRole("menuitem", { name: "踢出房间" }));

		expect(screen.queryByRole("menu")).toBeNull();
		expect(mocks.kickMember).not.toHaveBeenCalled();
		const dialog = screen.getByRole("dialog", { name: "移出语音房间" });
		expect(dialog.textContent).toContain("Bob");

		fireEvent.click(screen.getByRole("button", { name: "移出" }));
		expect(mocks.kickMember).toHaveBeenCalledWith("测试", "bob");
	});

	it("静音菜单项沿用原有静音能力并关闭菜单", () => {
		joinWithMembers();
		render(<RoomDetail />);

		openMemberMenu(screen.getByRole("button", { name: /更多操作/ }));
		fireEvent.click(screen.getByRole("menuitem", { name: "静音" }));

		expect(mocks.setMemberMute).toHaveBeenCalledWith("bob", true);
		expect(screen.queryByRole("menu")).toBeNull();
	});
});

describe("RoomDetail / 成员卡片禁言", () => {
	it("有 mute:manage 权限时显示禁言菜单项", () => {
		joinWithMembers();
		mocks.hasPermission.mockImplementation(
			(code?: string) => code === "mute:manage",
		);
		render(<RoomDetail />);

		openMemberMenu(screen.getByRole("button", { name: /更多操作/ }));

		expect(screen.getByRole("menuitem", { name: "禁言" })).toBeTruthy();
	});

	it("无 mute:manage 权限时不显示禁言菜单项", () => {
		joinWithMembers();
		render(<RoomDetail />);

		openMemberMenu(screen.getByRole("button", { name: /更多操作/ }));

		expect(screen.queryByRole("menuitem", { name: "禁言" })).toBeNull();
	});

	it("点击禁言先弹确认框，取消不产生请求或状态变更", () => {
		joinWithMembers();
		mocks.hasPermission.mockImplementation(
			(code?: string) => code === "mute:manage",
		);
		render(<RoomDetail />);

		openMemberMenu(screen.getByRole("button", { name: /更多操作/ }));
		fireEvent.click(screen.getByRole("menuitem", { name: "禁言" }));

		expect(screen.queryByRole("menu")).toBeNull();
		const dialog = screen.getByRole("dialog", { name: "禁言用户" });
		expect(dialog.textContent).toContain("Bob");
		expect(mocks.fetchUserInfo).not.toHaveBeenCalled();
		expect(mocks.createMute).not.toHaveBeenCalled();

		fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));

		expect(screen.queryByRole("dialog", { name: "禁言用户" })).toBeNull();
		expect(mocks.fetchUserInfo).not.toHaveBeenCalled();
		expect(mocks.createMute).not.toHaveBeenCalled();
	});

	it("成员已有 user_uuid 时直接禁言，不再查询用户资料", async () => {
		joinWithMembers();
		mocks.hasPermission.mockImplementation(
			(code?: string) => code === "mute:manage",
		);
		render(<RoomDetail />);

		openMemberMenu(screen.getByRole("button", { name: /更多操作/ }));
		fireEvent.click(screen.getByRole("menuitem", { name: "禁言" }));
		const dialog = screen.getByRole("dialog", { name: "禁言用户" });
		fireEvent.click(within(dialog).getByRole("button", { name: "禁言" }));

		await waitFor(() => {
			expect(mocks.fetchUserInfo).not.toHaveBeenCalled();
			expect(mocks.createMute).toHaveBeenCalledWith({
				user_uuid: "user-uuid-bob",
				duration: 3600,
				permanent: false,
				reason: "",
			});
		});
	});
});

function makeTrack() {
	return { attach: vi.fn(), detach: vi.fn(() => []) };
}

function joinWithShares(
	remote: Array<{
		identity: string;
		source: "screen" | "camera";
		track: unknown;
	}>,
	remotePublications: Array<{ identity: string; source: "screen" }> = [],
	localSharing = false,
	localTrack: unknown = null,
) {
	reset({
		phase: "ready",
		phaseLabel: "已连接",
		isJoined: true,
		isLoading: false,
	});
	mocks.socket.rooms = [
		{ name: "测试", domain_uuid: null, members: [bob, meMember] },
	];
	mocks.share.remote = remote;
	mocks.share.remotePublications = remotePublications;
	mocks.share.localSharing = localSharing;
	mocks.share.localTrack = localTrack;
}

function screenPublication(identity: string) {
	return { identity, source: "screen" as const };
}

function screenTrack(identity: string) {
	return { identity, source: "screen" as const, track: makeTrack() };
}

describe("RoomDetail / 共享观看与切换", () => {
	it("仅 publication 存在时不自动播放，成员卡片显示共享角标", () => {
		joinWithShares([], [screenPublication("bob")]);
		render(<RoomDetail />);

		expect(
			screen.getByRole("button", { name: "观看 Bob 的屏幕共享" }),
		).toBeTruthy();
		expect(screen.getByText("Bob")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "退出共享" })).toBeNull();
		expect(document.querySelector("video")).toBeNull();
	});

	it("首次点击等待订阅完成，track 到达后进入共享视图", async () => {
		const deferred: { resolve?: () => void } = {};
		mocks.watchScreenShare.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					deferred.resolve = resolve;
				}),
		);
		joinWithShares([], [screenPublication("bob")]);
		const { rerender } = render(<RoomDetail />);
		fireEvent.click(
			screen.getByRole("button", { name: "观看 Bob 的屏幕共享" }),
		);

		expect(screen.queryByRole("button", { name: "退出共享" })).toBeNull();
		expect(screen.getByText("正在订阅共享...")).toBeTruthy();

		deferred.resolve?.();
		await waitFor(() => {
			expect(deferred.resolve).toBeTruthy();
		});
		mocks.share.remote = [screenTrack("bob")];
		rerender(<RoomDetail />);

		expect(screen.getByText("Bob 正在共享屏幕")).toBeTruthy();
		expect(screen.getByRole("button", { name: "退出共享" })).toBeTruthy();
	});

	it("订阅失败时不进入共享视图且给出反馈", async () => {
		mocks.watchScreenShare.mockImplementationOnce(() =>
			Promise.reject(new Error("subscribe failed")),
		);
		joinWithShares([], [screenPublication("bob")]);
		render(<RoomDetail />);
		fireEvent.click(
			screen.getByRole("button", { name: "观看 Bob 的屏幕共享" }),
		);

		await waitFor(() => {
			expect(screen.queryByText("正在订阅共享...")).toBeNull();
		});
		expect(screen.queryByRole("button", { name: "退出共享" })).toBeNull();
		expect(document.querySelector("video")).toBeNull();
		expect(
			screen.getByRole("button", { name: "观看 Bob 的屏幕共享" }),
		).toBeTruthy();
	});

	it("点击共享角标调用 watchScreenShare(identity)", () => {
		joinWithShares([], [screenPublication("bob")]);
		render(<RoomDetail />);

		fireEvent.click(
			screen.getByRole("button", { name: "观看 Bob 的屏幕共享" }),
		);

		expect(mocks.watchScreenShare).toHaveBeenCalledTimes(1);
		expect(mocks.watchScreenShare).toHaveBeenCalledWith("bob");
	});

	it("点击观看已订阅 track 后渲染共享画面与退出按钮", async () => {
		joinWithShares([screenTrack("bob")], [screenPublication("bob")]);
		render(<RoomDetail />);
		fireEvent.click(
			screen.getByRole("button", { name: "观看 Bob 的屏幕共享" }),
		);

		await waitFor(() => {
			expect(screen.getByText("Bob 正在共享屏幕")).toBeTruthy();
		});
		expect(screen.getByRole("button", { name: "退出共享" })).toBeTruthy();
	});

	it("点击退出共享调用 stopWatchingScreenShare 并回到成员网格", async () => {
		joinWithShares([screenTrack("bob")], [screenPublication("bob")]);
		render(<RoomDetail />);
		fireEvent.click(
			screen.getByRole("button", { name: "观看 Bob 的屏幕共享" }),
		);
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "退出共享" })).toBeTruthy();
		});

		fireEvent.click(screen.getByRole("button", { name: "退出共享" }));

		expect(mocks.stopWatchingScreenShare).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("button", { name: "退出共享" })).toBeNull();
		expect(
			screen.getByRole("button", { name: "观看 Bob 的屏幕共享" }),
		).toBeTruthy();
	});

	it("多人已订阅共享渲染切换条，点击后切换主画面", async () => {
		joinWithShares(
			[screenTrack("bob"), screenTrack("alice")],
			[screenPublication("bob"), screenPublication("alice")],
		);
		mocks.socket.rooms = [
			{
				name: "测试",
				domain_uuid: null,
				members: [
					bob,
					{ ...bob, identity: "alice", name: "alice", display_name: "Alice" },
				],
			},
		];
		render(<RoomDetail />);
		fireEvent.click(
			screen.getByRole("button", { name: "观看 Bob 的屏幕共享" }),
		);

		await waitFor(() => {
			expect(screen.getByText("Bob 正在共享屏幕")).toBeTruthy();
		});
		const aliceButton = screen.getByRole("button", {
			name: "切换到 Alice 的共享",
		});
		expect(aliceButton.textContent).toContain("Alice");
		expect(aliceButton.getAttribute("aria-pressed")).toBe("false");

		fireEvent.click(aliceButton);

		await waitFor(() => {
			expect(screen.getByText("Alice 正在共享屏幕")).toBeTruthy();
		});
		expect(aliceButton.getAttribute("aria-pressed")).toBe("true");
	});

	it("切换条点击先订阅再切换，订阅完成前保持原共享画面", async () => {
		const deferred: { resolve?: () => void } = {};
		joinWithShares(
			[screenTrack("bob"), screenTrack("alice")],
			[screenPublication("bob"), screenPublication("alice")],
		);
		mocks.socket.rooms = [
			{
				name: "测试",
				domain_uuid: null,
				members: [
					bob,
					{ ...bob, identity: "alice", name: "alice", display_name: "Alice" },
				],
			},
		];
		render(<RoomDetail />);
		fireEvent.click(
			screen.getByRole("button", { name: "观看 Bob 的屏幕共享" }),
		);
		await waitFor(() => {
			expect(screen.getByText("Bob 正在共享屏幕")).toBeTruthy();
		});
		mocks.watchScreenShare.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					deferred.resolve = resolve;
				}),
		);

		const aliceButton = screen.getByRole("button", {
			name: "切换到 Alice 的共享",
		});
		fireEvent.click(aliceButton);

		expect(mocks.watchScreenShare).toHaveBeenCalledWith("alice");
		expect(screen.getByText("Bob 正在共享屏幕")).toBeTruthy();
		expect(aliceButton.getAttribute("aria-pressed")).toBe("false");

		deferred.resolve?.();
		await waitFor(() => {
			expect(screen.getByText("Alice 正在共享屏幕")).toBeTruthy();
		});
		expect(
			screen
				.getByRole("button", { name: "切换到 Alice 的共享" })
				.getAttribute("aria-pressed"),
		).toBe("true");
	});

	it("当前共享者离开后回到成员网格", async () => {
		joinWithShares(
			[screenTrack("bob"), screenTrack("alice")],
			[screenPublication("bob"), screenPublication("alice")],
		);
		mocks.socket.rooms = [
			{
				name: "测试",
				domain_uuid: null,
				members: [
					bob,
					{ ...bob, identity: "alice", name: "alice", display_name: "Alice" },
				],
			},
		];
		const { rerender } = render(<RoomDetail />);
		fireEvent.click(
			screen.getByRole("button", { name: "观看 Bob 的屏幕共享" }),
		);
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "退出共享" })).toBeTruthy();
		});
		fireEvent.click(
			screen.getByRole("button", { name: "切换到 Alice 的共享" }),
		);
		await waitFor(() => {
			expect(screen.getByText("Alice 正在共享屏幕")).toBeTruthy();
		});

		mocks.share.remote = mocks.share.remote.filter(
			(item) => item.identity !== "alice",
		);
		rerender(<RoomDetail />);

		expect(screen.queryByRole("button", { name: "退出共享" })).toBeNull();
		expect(document.querySelector("video")).toBeNull();
		expect(screen.queryByRole("button", { name: /切换到/ })).toBeNull();
		expect(screen.getByText("Bob")).toBeTruthy();
	});

	it("只有摄像头画面时回落到成员卡片网格", () => {
		joinWithShares([{ identity: "bob", source: "camera", track: makeTrack() }]);
		render(<RoomDetail />);

		expect(screen.queryByText(/正在共享屏幕/)).toBeNull();
		expect(screen.getByText("Bob")).toBeTruthy();
	});

	it("本人共享不自动进入自预览，卡片显示共享角标", () => {
		joinWithShares(
			[screenTrack("bob")],
			[screenPublication("bob")],
			true,
			makeTrack(),
		);
		render(<RoomDetail />);

		expect(screen.queryByText("你正在共享屏幕")).toBeNull();
		expect(
			screen.getByRole("button", { name: "观看 我 的屏幕共享" }),
		).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "观看 Bob 的屏幕共享" }),
		).toBeTruthy();
	});

	it("点击本人卡片进入自预览，不触发远端订阅；退出后回到成员网格", async () => {
		joinWithShares(
			[screenTrack("bob")],
			[screenPublication("bob")],
			true,
			makeTrack(),
		);
		render(<RoomDetail />);

		fireEvent.click(screen.getByRole("button", { name: "观看 我 的屏幕共享" }));
		expect(screen.getByText("你正在共享屏幕")).toBeTruthy();
		expect(mocks.watchScreenShare).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "退出预览" }));
		expect(screen.queryByText("你正在共享屏幕")).toBeNull();
		expect(mocks.stopWatchingScreenShare).not.toHaveBeenCalled();
		expect(
			screen.getByRole("button", { name: "观看 我 的屏幕共享" }),
		).toBeTruthy();
	});
});
