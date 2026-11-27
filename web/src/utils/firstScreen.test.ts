import { describe, expect, it } from "vitest";
import { resolveFirstScreen, resolveFirstScreenFromCache } from "./firstScreen";

describe("resolveFirstScreen", () => {
	it("sends users with no domains to the discovery/onboarding page", () => {
		expect(resolveFirstScreen([], "g-old")).toBeNull();
		expect(resolveFirstScreen([], null)).toBeNull();
	});

	it("returns to the last visited domain when still a member", () => {
		expect(resolveFirstScreen(["g-1", "g-2"], "g-2")).toBe("g-2");
	});

	it("falls back to the first domain when the remembered one is stale", () => {
		expect(resolveFirstScreen(["g-1", "g-2"], "g-removed")).toBe("g-1");
		expect(resolveFirstScreen(["g-1"], null)).toBe("g-1");
	});
});

describe("resolveFirstScreenFromCache（冷启动不等网络）", () => {
	it("有上次所在的域且无域列表缓存时，直接用上次的域分流", () => {
		expect(resolveFirstScreenFromCache([], "g-last")).toBe("g-last");
	});

	it("有域列表缓存时按列表校验（退域/被移出的域不直达）", () => {
		expect(resolveFirstScreenFromCache(["g-1", "g-2"], "g-2")).toBe("g-2");
		expect(resolveFirstScreenFromCache(["g-1"], "g-removed")).toBe("g-1");
	});

	it("既无列表又无上次域时返回 null（交给发现页引导）", () => {
		expect(resolveFirstScreenFromCache([], null)).toBeNull();
	});
});
