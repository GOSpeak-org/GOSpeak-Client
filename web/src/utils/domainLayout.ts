import type {
	DomainGroup,
	DomainLayout,
	DomainLayoutItem,
} from "@/api/domainLayout";

export const GROUP_COLORS = [
	{
		value: "lime",
		label: "青柠",
		swatch: "bg-accent",
		chip: "bg-accent text-accent-foreground",
	},
	{
		value: "sky",
		label: "天蓝",
		swatch: "bg-info",
		chip: "bg-info text-info-foreground",
	},
	{
		value: "rose",
		label: "玫红",
		swatch: "bg-destructive",
		chip: "bg-destructive text-destructive-foreground",
	},
	{
		value: "amber",
		label: "琥珀",
		swatch: "bg-warning",
		chip: "bg-warning text-warning-foreground",
	},
	{
		value: "violet",
		label: "紫罗兰",
		swatch: "bg-primary",
		chip: "bg-primary text-primary-foreground",
	},
	{
		value: "slate",
		label: "石墨",
		swatch: "bg-neutral",
		chip: "bg-neutral text-neutral-foreground",
	},
] as const;

export const GROUP_COLOR_VALUES = GROUP_COLORS.map((c) => c.value);

export function colorChip(color: string): string {
	return (
		GROUP_COLORS.find((c) => c.value === color)?.chip ??
		"bg-accent text-accent-foreground"
	);
}

export function colorSwatch(color: string): string {
	return GROUP_COLORS.find((c) => c.value === color)?.swatch ?? "bg-accent";
}

/** 按容器（分组或未分组）返回已排序的条目。 */
export function itemsInGroup(
	layout: DomainLayout,
	groupUUID: string | null,
): DomainLayoutItem[] {
	return layout.items
		.filter((item) => (item.group_uuid ?? null) === groupUUID)
		.sort((a, b) => a.sort_order - b.sort_order);
}

/** 归一化：去重、过滤已退出域、丢弃不属于本人的分组、按容器重排序号。 */
export function normalizeLayout(
	layout: DomainLayout,
	joinedUUIDs?: string[],
): DomainLayout {
	const seenGroups = new Set<string>();
	const groups: DomainGroup[] = [];
	for (const group of [...layout.groups].sort(
		(a, b) => a.sort_order - b.sort_order,
	)) {
		if (seenGroups.has(group.uuid)) continue;
		seenGroups.add(group.uuid);
		groups.push({ ...group, sort_order: groups.length });
	}
	const groupUUIDs = new Set(groups.map((g) => g.uuid));

	const seenDomains = new Set<string>();
	const items: DomainLayoutItem[] = [];
	for (const item of [...layout.items].sort(
		(a, b) => a.sort_order - b.sort_order,
	)) {
		if (seenDomains.has(item.domain_uuid)) continue;
		if (joinedUUIDs && !joinedUUIDs.includes(item.domain_uuid)) continue;
		seenDomains.add(item.domain_uuid);
		items.push({
			...item,
			group_uuid:
				item.group_uuid && groupUUIDs.has(item.group_uuid)
					? item.group_uuid
					: null,
		});
	}
	if (joinedUUIDs) {
		for (const domainUUID of joinedUUIDs) {
			if (seenDomains.has(domainUUID)) continue;
			seenDomains.add(domainUUID);
			items.push({ domain_uuid: domainUUID, group_uuid: null, sort_order: 0 });
		}
	}

	const counters = new Map<string, number>();
	for (const item of items) {
		const key = item.group_uuid ?? "";
		const index = counters.get(key) ?? 0;
		item.sort_order = index;
		counters.set(key, index + 1);
	}
	return { groups, items };
}

/** 把一个域移动到目标容器的指定位置；目标容器可以是 null（未分组）。 */
export function moveDomain(
	layout: DomainLayout,
	domainUUID: string,
	groupUUID: string | null,
	index: number,
): DomainLayout {
	const moving = layout.items.find((item) => item.domain_uuid === domainUUID);
	if (!moving) return layout;
	const rest = layout.items.filter((item) => item.domain_uuid !== domainUUID);
	const target = itemsInGroup({ ...layout, items: rest }, groupUUID);
	const position = Math.max(0, Math.min(index, target.length));
	target.splice(position, 0, { ...moving, group_uuid: groupUUID });
	const renumbered = target.map((item, i) => ({ ...item, sort_order: i }));
	return {
		groups: layout.groups,
		items: [
			...rest.filter((item) => (item.group_uuid ?? null) !== groupUUID),
			...renumbered,
		],
	};
}

export function reorderGroup(
	layout: DomainLayout,
	from: number,
	to: number,
): DomainLayout {
	const groups = [...layout.groups].sort((a, b) => a.sort_order - b.sort_order);
	if (
		from < 0 ||
		to < 0 ||
		from >= groups.length ||
		to >= groups.length ||
		from === to
	) {
		return layout;
	}
	const [moved] = groups.splice(from, 1);
	groups.splice(to, 0, moved);
	return {
		...layout,
		groups: groups.map((group, index) => ({ ...group, sort_order: index })),
	};
}

export function reorderDomain(
	layout: DomainLayout,
	groupUUID: string | null,
	from: number,
	to: number,
): DomainLayout {
	const list = itemsInGroup(layout, groupUUID);
	if (
		from < 0 ||
		to < 0 ||
		from >= list.length ||
		to >= list.length ||
		from === to
	) {
		return layout;
	}
	const moved = list[from];
	return moveDomain(layout, moved.domain_uuid, groupUUID, to);
}

export function deleteGroup(
	layout: DomainLayout,
	groupUUID: string,
): DomainLayout {
	const groups = layout.groups
		.filter((group) => group.uuid !== groupUUID)
		.map((group, index) => ({ ...group, sort_order: index }));
	const items = layout.items.map((item) =>
		item.group_uuid === groupUUID ? { ...item, group_uuid: null } : item,
	);
	return normalizeLayout({ groups, items });
}

export function createGroup(
	layout: DomainLayout,
	uuid: string,
	name: string,
	color: string,
): DomainLayout {
	return {
		...layout,
		groups: [
			...layout.groups,
			{ uuid, name, color, sort_order: layout.groups.length },
		],
	};
}
