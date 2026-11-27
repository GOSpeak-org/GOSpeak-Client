import { create } from "zustand";
import {
	type DomainGroup,
	type DomainLayout,
	type DomainLayoutItem,
	getDomainLayout,
	saveDomainLayout,
} from "@/api/domainLayout";
import { toastActionError } from "@/utils/toast";
import {
	createGroup,
	deleteGroup,
	moveDomain,
	normalizeLayout,
	reorderDomain,
	reorderGroup,
} from "@/utils/domainLayout";

interface DomainLayoutState {
	groups: DomainGroup[];
	items: DomainLayoutItem[];
	loaded: boolean;
	loading: boolean;
	saving: boolean;
	error: string | null;
}

const EMPTY_STATE: DomainLayoutState = {
	groups: [],
	items: [],
	loaded: false,
	loading: false,
	saving: false,
	error: null,
};

export const useDomainLayoutStore = create<DomainLayoutState>(() => ({
	...EMPTY_STATE,
}));

const SAVE_DELAY_MS = 400;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveGeneration = 0;
let loadGeneration = 0;

function currentLayout(): DomainLayout {
	const state = useDomainLayoutStore.getState();
	return { groups: state.groups, items: state.items };
}

function applyLayout(layout: DomainLayout): void {
	useDomainLayoutStore.setState({ groups: layout.groups, items: layout.items });
}

// 显示顺序整体上下颠倒：在 store 内部反转 sort_order，保存/加载时再翻回服务端语义。
function flipLayout(layout: DomainLayout): DomainLayout {
	const groups = [...layout.groups]
		.sort((a, b) => a.sort_order - b.sort_order)
		.map((group, index) => ({
			...group,
			sort_order: layout.groups.length - 1 - index,
		}));
	const byGroup = new Map<string, DomainLayoutItem[]>();
	for (const item of layout.items) {
		const key = item.group_uuid ?? "";
		const list = byGroup.get(key) ?? [];
		list.push(item);
		byGroup.set(key, list);
	}
	const items: DomainLayoutItem[] = [];
	for (const list of byGroup.values()) {
		list.sort((a, b) => a.sort_order - b.sort_order);
		const size = list.length;
		for (const [index, item] of list.entries()) {
			items.push({ ...item, sort_order: size - 1 - index });
		}
	}
	return { groups, items };
}

async function flushSave(
	generation: number,
	layout: DomainLayout,
): Promise<void> {
	useDomainLayoutStore.setState({ saving: true, error: null });
	try {
		const saved = await saveDomainLayout(flipLayout(layout));
		if (generation === saveGeneration) {
			applyLayout(flipLayout(normalizeLayout(saved)));
			useDomainLayoutStore.setState({ saving: false });
		}
	} catch (error) {
		if (generation === saveGeneration) {
			const message = toastActionError(error, "域布局保存失败");
			useDomainLayoutStore.setState({ saving: false, error: message });
		}
	}
}

function commit(layout: DomainLayout): void {
	applyLayout(layout);
	saveGeneration += 1;
	const generation = saveGeneration;
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		saveTimer = null;
		void flushSave(generation, layout);
	}, SAVE_DELAY_MS);
}

const load = async (): Promise<void> => {
	const generation = ++loadGeneration;
	useDomainLayoutStore.setState({ loading: true, error: null });
	try {
		const layout = await getDomainLayout();
		if (generation === loadGeneration) {
			applyLayout(flipLayout(normalizeLayout(layout)));
			useDomainLayoutStore.setState({ loaded: true, loading: false });
		}
	} catch {
		if (generation === loadGeneration) {
			useDomainLayoutStore.setState({
				groups: [],
				items: [],
				loaded: true,
				loading: false,
				error: "域布局加载失败，已按默认顺序显示",
			});
		}
	}
};

function newUUID(): string {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}
	return `g-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const domainLayoutStore = {
	get state() {
		return useDomainLayoutStore.getState();
	},
	load,
	addGroup: (name: string, color: string) => {
		commit(createGroup(currentLayout(), newUUID(), name.trim(), color));
	},
	renameGroup: (uuid: string, name: string) => {
		const trimmed = name.trim();
		if (!trimmed) return;
		const layout = currentLayout();
		commit({
			...layout,
			groups: layout.groups.map((group) =>
				group.uuid === uuid ? { ...group, name: trimmed } : group,
			),
		});
	},
	recolorGroup: (uuid: string, color: string) => {
		const layout = currentLayout();
		commit({
			...layout,
			groups: layout.groups.map((group) =>
				group.uuid === uuid ? { ...group, color } : group,
			),
		});
	},
	removeGroup: (uuid: string) => {
		commit(deleteGroup(currentLayout(), uuid));
	},
	moveDomain: (domainUUID: string, groupUUID: string | null, index: number) => {
		commit(moveDomain(currentLayout(), domainUUID, groupUUID, index));
	},
	reorderGroups: (from: number, to: number) => {
		commit(reorderGroup(currentLayout(), from, to));
	},
	reorderDomains: (groupUUID: string | null, from: number, to: number) => {
		commit(reorderDomain(currentLayout(), groupUUID, from, to));
	},
	flushNow: () => {
		if (saveTimer) {
			clearTimeout(saveTimer);
			saveTimer = null;
		}
		const generation = ++saveGeneration;
		return flushSave(generation, currentLayout());
	},
};

export function createDomainLayoutStore() {
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = null;
	saveGeneration += 1;
	loadGeneration += 1;
	useDomainLayoutStore.setState({ ...EMPTY_STATE });
	return domainLayoutStore;
}

export default domainLayoutStore;
