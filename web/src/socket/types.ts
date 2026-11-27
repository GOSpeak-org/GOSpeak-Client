// wire 类型单一来源是 @/protocol/generated/payloads（后端 internal/protocol 生成）。
// MemberInfo 与生成物完全一致，直接重导出；其余类型带本地扩展/容错字段，保留手写。
import type { MemberInfo } from "@/protocol/generated/payloads";
export type { MemberInfo };

export interface RoomInfo {
	id: number;
	uuid: string;
	name: string;
	domain_uuid?: string;
	has_password: boolean;
	description?: string;
	limit: number;
	audio_only?: boolean;
	allow_audience?: boolean;
	type?: string;
	members: MemberInfo[];
	count: number;
	/** 服务端房间创建时间；本地未从服务端收到前不伪造（可选，缺省表示未知） */
	created_at?: number;
	/** 服务端下发的创建者用户名，用于房间管理权限判定 */
	created_by?: string;
	/** 域内房间分组；空表示未分组 */
	group_uuid?: string;
	/** 组内显示顺序 */
	sort_order?: number;
	/** @internal 临时传递密码，不从服务器获取 */
	_password?: string;
}

export interface MuteEvent {
	user_uuid: string;
	permanent: boolean;
	expires_at: string | null;
	reason: string;
}

export interface UnmuteEvent {
	user_uuid: string;
}

export interface ActivityEvent {
	type: "member_joined" | "member_left" | "room_joined" | "room_left";
	room: string;
	domain_uuid?: string;
	identity?: string;
	timestamp: number;
}

export interface RoomPresenceEvent {
	type: "member_joined" | "member_left";
	room: string;
	domain_uuid?: string;
	identity: string;
	timestamp: number;
}
