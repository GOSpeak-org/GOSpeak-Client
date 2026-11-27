import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	requestNotificationPermission,
	showNotification,
} from "./notification";

class FakeNotification {
	static permission: NotificationPermission = "granted";
	static instances: FakeNotification[] = [];
	static requestPermission = vi.fn(
		async (): Promise<NotificationPermission> => "granted",
	);

	title: string;
	body?: string;
	icon?: string;
	onclick: (() => void) | null = null;

	constructor(title: string, options?: { body?: string; icon?: string }) {
		this.title = title;
		this.body = options?.body;
		this.icon = options?.icon;
		FakeNotification.instances.push(this);
	}
}

function installNotification(): void {
	FakeNotification.instances = [];
	FakeNotification.permission = "granted";
	FakeNotification.requestPermission.mockClear();
	(globalThis as unknown as { Notification: unknown }).Notification =
		FakeNotification;
}

function uninstallNotification(): void {
	delete (globalThis as unknown as { Notification?: unknown }).Notification;
}

async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

let warnSpy: { mockRestore(): void } | null = null;

beforeEach(() => {
	warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	warnSpy?.mockRestore();
	warnSpy = null;
	uninstallNotification();
});

describe("showNotification / 浏览器降级", () => {
	it("无 Notifications API 时不抛错，返回可调用的 handle", () => {
		uninstallNotification();
		let handle: ReturnType<typeof showNotification> | undefined;
		expect(() => {
			handle = showNotification({ title: "hi" });
		}).not.toThrow();
		expect(typeof handle?.onClick).toBe("function");
	});

	it("权限 granted 时创建通知，点击触发已注册的 handler", () => {
		installNotification();
		let clicks = 0;
		const handle = showNotification({ title: "hello", body: "world" });
		handle.onClick(() => {
			clicks += 1;
		});

		expect(FakeNotification.instances).toHaveLength(1);
		expect(FakeNotification.instances[0]?.title).toBe("hello");
		expect(FakeNotification.instances[0]?.body).toBe("world");
		FakeNotification.instances[0]?.onclick?.();
		expect(clicks).toBe(1);
	});

	it("权限 denied 时不创建通知也不抛错", () => {
		installNotification();
		FakeNotification.permission = "denied";
		expect(() => showNotification({ title: "no" })).not.toThrow();
		expect(FakeNotification.instances).toHaveLength(0);
	});

	it("权限 default 时请求授权，授权后创建通知", async () => {
		installNotification();
		FakeNotification.permission = "default";
		const result = showNotification({ title: "later" });

		expect(FakeNotification.instances).toHaveLength(0);
		expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
		await flush();
		expect(FakeNotification.instances).toHaveLength(1);
		expect(typeof result.onClick).toBe("function");
	});

	it("Notification 构造抛错时不向调用方传播", () => {
		installNotification();
		const throwing = Object.assign(
			function ThrowingNotification(): void {
				throw new Error("boom");
			},
			{ permission: "granted" as NotificationPermission },
		);
		(globalThis as unknown as { Notification: unknown }).Notification =
			throwing;

		expect(() => showNotification({ title: "x" })).not.toThrow();
	});
});

describe("requestNotificationPermission / 浏览器降级", () => {
	it("无 API 时 resolve denied", async () => {
		uninstallNotification();
		await expect(requestNotificationPermission()).resolves.toBe("denied");
	});
});
