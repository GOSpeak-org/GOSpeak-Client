import apiClient from "./apiClient";

export interface MuteRecord {
	id: number;
	uuid: string;
	user_uuid: string;
	muter_uuid: string;
	duration: number;
	permanent: boolean;
	expires_at: string | null;
	reason: string;
	created_at: string;
	updated_at: string;
}

export interface CreateMuteParams {
	user_uuid: string;
	duration: number;
	permanent: boolean;
	reason: string;
}

export async function createMute(
	params: CreateMuteParams,
): Promise<MuteRecord> {
	const data = await apiClient.post<MuteRecord>({
		url: "/api/v1/mute/create",
		data: params,
	});

	if (!data) throw new Error("mute record is missing");
	return data;
}

export async function cancelMute(userUUID: string): Promise<void> {
	await apiClient.post({
		url: "/api/v1/mute/cancel",
		data: { user_uuid: userUUID },
	});
}

export async function listMutes(): Promise<MuteRecord[]> {
	const data = await apiClient.post<MuteRecord[]>({
		url: "/api/v1/mute/list",
	});

	return data || [];
}
