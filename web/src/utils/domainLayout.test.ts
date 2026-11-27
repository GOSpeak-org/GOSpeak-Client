import { describe, expect, it } from "vitest";
import type { DomainLayout } from "@/api/domainLayout";
import {
	createGroup,
	deleteGroup,
	itemsInGroup,
	moveDomain,
	normalizeLayout,
	reorderDomain,
	reorderGroup,
} from "./domainLayout";

function layout(): DomainLayout {
	return {
		groups: [
			{ uuid: "g1", name: "工作", color: "lime", sort_order: 0 },
			{ uuid: "g2", name: "游戏", color: "sky", sort_order: 1 },
		],
		items: [
			{ domain_uuid: "d1", group_uuid: "g1", sort_order: 0 },
			{ domain_uuid: "d2", group_uuid: "g1", sort_order: 1 },
			{ domain_uuid: "d3", group_uuid: null, sort_order: 0 },
			{ domain_uuid: "d4", group_uuid: "g2", sort_order: 0 },
		],
	};
}

describe("domain layout helpers", () => {
	it("itemsInGroup returns sorted entries of a container", () => {
		expect(itemsInGroup(layout(), "g1").map((i) => i.domain_uuid)).toEqual([
			"d1",
			"d2",
		]);
		expect(itemsInGroup(layout(), null).map((i) => i.domain_uuid)).toEqual([
			"d3",
		]);
	});

	it("normalizeLayout fills missing joined domains as ungrouped", () => {
		const result = normalizeLayout(layout(), ["d1", "d2", "d3", "d4", "d5"]);
		expect(itemsInGroup(result, null).map((i) => i.domain_uuid)).toEqual([
			"d3",
			"d5",
		]);
	});

	it("normalizeLayout drops domains the user left", () => {
		const result = normalizeLayout(layout(), ["d1", "d3"]);
		expect(result.items.map((i) => i.domain_uuid)).toEqual(["d1", "d3"]);
	});

	it("normalizeLayout moves items of removed groups to ungrouped", () => {
		const result = normalizeLayout({
			groups: [],
			items: [{ domain_uuid: "d1", group_uuid: "gone", sort_order: 0 }],
		});
		expect(result.items[0].group_uuid).toBeNull();
	});

	it("moveDomain moves an item between containers and renumbers", () => {
		const result = moveDomain(layout(), "d1", null, 0);
		expect(itemsInGroup(result, null).map((i) => i.domain_uuid)).toEqual([
			"d1",
			"d3",
		]);
		expect(itemsInGroup(result, "g1").map((i) => i.domain_uuid)).toEqual([
			"d2",
		]);
		expect(itemsInGroup(result, null).map((i) => i.sort_order)).toEqual([0, 1]);
	});

	it("reorderGroup swaps order and renumbers", () => {
		const result = reorderGroup(layout(), 0, 1);
		expect(result.groups.map((g) => g.uuid)).toEqual(["g2", "g1"]);
		expect(result.groups.map((g) => g.sort_order)).toEqual([0, 1]);
	});

	it("reorderDomain reorders inside one container", () => {
		const result = reorderDomain(layout(), "g1", 0, 1);
		expect(itemsInGroup(result, "g1").map((i) => i.domain_uuid)).toEqual([
			"d2",
			"d1",
		]);
	});

	it("deleteGroup releases its domains", () => {
		const result = deleteGroup(layout(), "g1");
		expect(result.groups.map((g) => g.uuid)).toEqual(["g2"]);
		expect(
			result.items.find((i) => i.domain_uuid === "d1")?.group_uuid,
		).toBeNull();
	});

	it("createGroup appends a group", () => {
		const result = createGroup(layout(), "g3", "新分组", "violet");
		expect(result.groups.at(-1)).toEqual({
			uuid: "g3",
			name: "新分组",
			color: "violet",
			sort_order: 2,
		});
	});
});
