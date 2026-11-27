import { useUserStore } from "@/stores/userStore";
import { hasDomainPermission } from "@/utils/domainPermissions";

export type RoomManagePermission = "room:update" | "room:delete";

/**
 * 房间管理权限的唯一判定入口，与服务端 RoomHandler.canManageRoom 对齐：
 * 域角色权限码命中，或当前用户是创建者。不使用全局权限或硬编码角色名。
 */
export function canManageRoom(
	room: {
		name?: string;
		domain_uuid?: string | null;
		created_by?: string | null;
	},
	permission: RoomManagePermission,
): boolean {
	if (hasDomainPermission(room.domain_uuid || "", permission)) return true;
	const currentName = useUserStore.getState().user?.name;
	return !!currentName && !!room.created_by && room.created_by === currentName;
}
