import { useUserStore } from "@/stores/userStore";

/**
 * 权限的唯一来源是服务端下发的 user.permissions（认证响应 / profile）。
 * 前端不再维护 role → 权限码的兜底表：那份手抄表会随后端
 * model.DefaultRolePermissions 的演进漂移（曾漏掉 domain:room-layout:manage），
 * 属于历史上的猴子补丁。服务端权限变更对前端零改动。
 */
export function hasPermission(code: string): boolean {
	// 封禁判决优先：即使缓存/响应里残留 permissions，也不放行。
	if (isBannedUser()) return false;
	return useUserStore.getState().user?.permissions?.includes(code) ?? false;
}

function isBannedUser(): boolean {
	return useUserStore.getState().user?.role === "ban";
}

/** 可进入 /manage 壳层的任一权限（页面内再做细粒度守卫）。 */
export const MANAGE_ENTRY_PERMISSIONS = [
	"domain:read",
	"domain:manage",
	"user:read",
	"user:update",
	"user:delete",
	"role:read",
	"role:manage",
	"mute:manage",
	"sfu:manage",
	"email_config:read",
	"email_config:manage",
	"storage:read",
	"storage:manage",
	"oauth:read",
	"oauth:manage",
	"announcement:manage",
] as const;

export function hasAnyPermission(...codes: string[]): boolean {
	return codes.some((code) => hasPermission(code));
}

export function hasManageAccess(): boolean {
	return hasAnyPermission(...MANAGE_ENTRY_PERMISSIONS);
}
