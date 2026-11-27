import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());

vi.mock("./apiClient", () => ({ default: { get, post } }));

import {
	getUnreadCount,
	listAnnouncements,
	adminListAnnouncements,
} from "./announcement";
import { listInvites } from "./invite";
import { getServerVersion, checkServerUpdate } from "./system";
import { getMyDomainsDetailed } from "./domain";

beforeEach(() => {
	post.mockReset();
	get.mockReset();
});

describe("background API requests are silent", () => {
	it("announcement polling and admin list never toast", async () => {
		post.mockResolvedValue({ count: 0 });
		await getUnreadCount();
		expect(post).toHaveBeenCalledWith(
			expect.objectContaining({
				url: "/api/v1/announcement/unread-count",
				silentError: true,
			}),
		);

		post.mockResolvedValue({ items: [], total: 0 });
		await listAnnouncements();
		expect(post).toHaveBeenCalledWith(
			expect.objectContaining({
				url: "/api/v1/announcement/list",
				silentError: true,
			}),
		);

		await adminListAnnouncements();
		expect(post).toHaveBeenCalledWith(
			expect.objectContaining({
				url: "/api/v1/announcement/admin/list",
				silentError: true,
			}),
		);
	});

	it("invite list, my-domains and version checks never toast", async () => {
		post.mockResolvedValue({ invites: [] });
		await listInvites("d1");
		expect(post).toHaveBeenCalledWith(
			expect.objectContaining({
				url: "/api/v1/domain/invites/list",
				silentError: true,
			}),
		);

		post.mockResolvedValue([]);
		await getMyDomainsDetailed();
		expect(post).toHaveBeenCalledWith(
			expect.objectContaining({
				url: "/api/v1/domain/my-domains",
				silentError: true,
			}),
		);

		get.mockResolvedValue({ version: "v1", commit: "c" });
		await getServerVersion();
		expect(get).toHaveBeenCalledWith(
			expect.objectContaining({
				url: "/api/v1/system/update/current",
				silentError: true,
			}),
		);
		await checkServerUpdate();
		// checkServerUpdate needs a non-empty payload
	});

	it("checkServerUpdate stays silent", async () => {
		get.mockResolvedValue({ current: "v1", latest: "v2", available: true });
		await checkServerUpdate();
		expect(get).toHaveBeenCalledWith(
			expect.objectContaining({
				url: "/api/v1/system/update/check",
				silentError: true,
			}),
		);
	});
});
