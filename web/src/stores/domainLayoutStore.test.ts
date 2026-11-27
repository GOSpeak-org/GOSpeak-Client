import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DomainLayout } from "@/api/domainLayout";

const mocks = vi.hoisted(() => ({
	getLayout: vi.fn(),
	saveLayout: vi.fn(),
	toastActionError: vi.fn((_error: unknown, fallback: string) => fallback),
}));

vi.mock("@/api/domainLayout", () => ({
	getDomainLayout: mocks.getLayout,
	saveDomainLayout: mocks.saveLayout,
}));
vi.mock("@/utils/toast", () => ({ toastActionError: mocks.toastActionError }));

import {
	createDomainLayoutStore,
	useDomainLayoutStore,
} from "./domainLayoutStore";

const savedLayout: DomainLayout = {
	groups: [{ uuid: "g1", name: "工作", color: "lime", sort_order: 0 }],
	items: [
		{ domain_uuid: "d1", group_uuid: "g1", sort_order: 0 },
		{ domain_uuid: "d2", group_uuid: null, sort_order: 0 },
	],
};

describe("domainLayoutStore", () => {
	beforeEach(() => {
		vi.useRealTimers();
		mocks.getLayout.mockReset().mockResolvedValue(savedLayout);
		mocks.saveLayout
			.mockReset()
			.mockImplementation(async (l: DomainLayout) => l);
		mocks.toastActionError.mockClear();
		createDomainLayoutStore();
	});

	it("load applies the server layout", async () => {
		const store = createDomainLayoutStore();
		await store.load();
		expect(useDomainLayoutStore.getState().groups).toEqual(savedLayout.groups);
		expect(useDomainLayoutStore.getState().loaded).toBe(true);
	});

	it("load falls back to empty layout on failure", async () => {
		mocks.getLayout.mockRejectedValue(new Error("offline"));
		const store = createDomainLayoutStore();
		await store.load();
		expect(useDomainLayoutStore.getState().items).toEqual([]);
		expect(useDomainLayoutStore.getState().error).toContain("加载失败");
	});

	it("moveDomain updates local state immediately and saves after debounce", async () => {
		vi.useFakeTimers();
		const store = createDomainLayoutStore();
		await store.load();
		mocks.saveLayout.mockClear();
		store.moveDomain("d2", "g1", 0);
		expect(
			useDomainLayoutStore.getState().items.find((i) => i.domain_uuid === "d2")
				?.group_uuid,
		).toBe("g1");
		expect(mocks.saveLayout).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(400);
		expect(mocks.saveLayout).toHaveBeenCalledTimes(1);
	});

	it("addGroup creates a group with an id", () => {
		const store = createDomainLayoutStore();
		store.addGroup("  新分组  ", "sky");
		const group = useDomainLayoutStore.getState().groups[0];
		expect(group.name).toBe("新分组");
		expect(group.uuid).toBeTruthy();
	});

	it("removeGroup releases its domains into ungrouped", () => {
		const store = createDomainLayoutStore();
		useDomainLayoutStore.setState(savedLayout);
		store.removeGroup("g1");
		expect(useDomainLayoutStore.getState().groups).toEqual([]);
		expect(
			useDomainLayoutStore.getState().items.every((i) => i.group_uuid === null),
		).toBe(true);
	});

	it("save failure keeps local changes and reports error", async () => {
		mocks.saveLayout.mockRejectedValue(new Error("fail"));
		const store = createDomainLayoutStore();
		useDomainLayoutStore.setState(savedLayout);
		await store.flushNow();
		expect(useDomainLayoutStore.getState().error).toBe("域布局保存失败");
		expect(useDomainLayoutStore.getState().groups).toEqual(savedLayout.groups);
	});
});
