import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_BUILD } from "../conditional";
import { createLocalNotification } from "./local-notification";

const { notificationCtor } = vi.hoisted(() => ({ notificationCtor: vi.fn() }));

const { plugin, registerPlugin } = vi.hoisted(() => {
	const plugin = {
		requestPermissions: vi.fn(async () => ({ display: "granted" })),
		schedule: vi.fn(async () => {}),
		cancel: vi.fn(async () => {}),
	};
	return { plugin, registerPlugin: vi.fn(() => plugin) };
});

vi.mock("@capacitor/core", () => ({ registerPlugin }));

beforeEach(() => {
	registerPlugin.mockClear();
	registerPlugin.mockImplementation(() => plugin);
	plugin.requestPermissions.mockReset();
	plugin.requestPermissions.mockImplementation(async () => ({
		display: "granted",
	}));
	plugin.schedule.mockReset();
	plugin.schedule.mockImplementation(async () => {});
	plugin.cancel.mockReset();
	plugin.cancel.mockImplementation(async () => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	notificationCtor.mockClear();
});

describe.skipIf(MOBILE_BUILD)("createLocalNotification in web fallback", () => {
	it("resolves notify without a native runtime", async () => {
		const local = createLocalNotification();
		await expect(
			local.notify({ id: 1, title: "标题", body: "内容" }),
		).resolves.toBeUndefined();
	});

	it("resolves cancel without a native runtime", async () => {
		await expect(createLocalNotification().cancel(1)).resolves.toBeUndefined();
	});

	it("does not throw when notify is called twice", async () => {
		const local = createLocalNotification();
		const options = { id: 1, title: "标题", body: "内容" };
		await expect(local.notify(options)).resolves.toBeUndefined();
		await expect(local.notify(options)).resolves.toBeUndefined();
	});

	it("does not throw when cancel is called with any id", async () => {
		const local = createLocalNotification();
		await expect(local.cancel(0)).resolves.toBeUndefined();
		await expect(local.cancel(-1)).resolves.toBeUndefined();
		await expect(local.cancel(9007199254740991)).resolves.toBeUndefined();
	});

	it("does not touch Notification when the global is absent", async () => {
		vi.stubGlobal("Notification", undefined);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		await expect(
			createLocalNotification().notify({ id: 1, title: "t", body: "b" }),
		).resolves.toBeUndefined();
		expect(warn).not.toHaveBeenCalled();
		expect(notificationCtor).not.toHaveBeenCalled();
	});

	it("uses the Web Notification API when available", async () => {
		vi.stubGlobal("Notification", notificationCtor);
		await createLocalNotification().notify({
			id: 7,
			title: "房间邀请",
			body: "快来加入",
		});
		expect(notificationCtor).toHaveBeenCalledWith("房间邀请", {
			body: "快来加入",
		});
	});

	it("never touches the Capacitor plugin", async () => {
		const local = createLocalNotification();
		await local.notify({ id: 1, title: "t", body: "b" });
		await local.cancel(1);
		expect(registerPlugin).not.toHaveBeenCalled();
	});
});

describe.runIf(MOBILE_BUILD)(
	"createLocalNotification on the native plugin",
	() => {
		it("schedules a single notification through LocalNotifications", async () => {
			await createLocalNotification().notify({
				id: 7,
				title: "房间邀请",
				body: "快来加入",
			});

			expect(registerPlugin).toHaveBeenCalledWith("LocalNotifications");
			expect(plugin.schedule).toHaveBeenCalledWith({
				notifications: [{ id: 7, title: "房间邀请", body: "快来加入" }],
			});
		});

		it("requests permission once before the first schedule", async () => {
			const local = createLocalNotification();
			await local.notify({ id: 1, title: "t", body: "b" });
			await local.notify({ id: 2, title: "t2", body: "b2" });

			expect(plugin.requestPermissions).toHaveBeenCalledTimes(1);
			expect(plugin.schedule).toHaveBeenCalledTimes(2);
		});

		it("cancels the notification by id", async () => {
			await createLocalNotification().cancel(5);

			expect(plugin.cancel).toHaveBeenCalledWith({
				notifications: [{ id: 5 }],
			});
		});

		it("does not touch the Web Notification API", async () => {
			vi.stubGlobal("Notification", notificationCtor);

			await createLocalNotification().notify({ id: 1, title: "t", body: "b" });

			expect(notificationCtor).not.toHaveBeenCalled();
		});

		it("warns and resolves when schedule fails", async () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			plugin.schedule.mockRejectedValueOnce(new Error("UNIMPLEMENTED"));

			await expect(
				createLocalNotification().notify({ id: 1, title: "t", body: "b" }),
			).resolves.toBeUndefined();

			expect(warn).toHaveBeenCalledWith(
				"[gospeak/mobile] LocalNotifications.schedule failed",
				expect.any(Error),
			);
		});

		it("warns and resolves when cancel fails", async () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			plugin.cancel.mockRejectedValueOnce(new Error("UNIMPLEMENTED"));

			await expect(
				createLocalNotification().cancel(1),
			).resolves.toBeUndefined();

			expect(warn).toHaveBeenCalledWith(
				"[gospeak/mobile] LocalNotifications.cancel failed",
				expect.any(Error),
			);
		});
	},
);
