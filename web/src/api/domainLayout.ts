import apiClient from "./apiClient";

export interface DomainGroup {
	uuid: string;
	name: string;
	color: string;
	sort_order: number;
}

export interface DomainLayoutItem {
	domain_uuid: string;
	group_uuid: string | null;
	sort_order: number;
}

export interface DomainLayout {
	groups: DomainGroup[];
	items: DomainLayoutItem[];
}

export async function getDomainLayout(): Promise<DomainLayout> {
	const result = await apiClient.post<DomainLayout>({
		url: "/api/v1/domain/layout/get",
		data: {},
		silentError: true,
	});
	if (!result) throw new Error("domain layout is missing");
	return result;
}

export async function saveDomainLayout(
	layout: DomainLayout,
): Promise<DomainLayout> {
	const result = await apiClient.post<DomainLayout>({
		url: "/api/v1/domain/layout/save",
		data: layout,
		silentError: true,
	});
	if (!result) throw new Error("saved domain layout is missing");
	return result;
}
