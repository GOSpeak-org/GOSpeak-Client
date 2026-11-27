import { Checkbox, toast } from "@gospeak/components";
import { useQuery } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { listPermissions } from "@/api/permission";
import {
	createRole,
	deleteRole,
	getRolePermissions,
	listRoles,
	syncRolePermissions,
	type Role,
} from "@/api/role";
import ConfirmModal from "@/components/common/ConfirmModal";
import { ManageLoading, ManageSection } from "@/components/manage/ManageShell";
import {
	clearBackgroundFailure,
	reportBackgroundFailure,
} from "@/utils/backgroundFailure";
import { toastActionError } from "@/utils/toast";

const SYSTEM_ROLES = new Set(["admin", "user", "ban"]);

function roleLabel(name: string) {
	if (name === "admin") return "管理员";
	if (name === "ban") return "封禁";
	if (name === "user") return "普通用户";
	return name;
}

const btnXs =
	"bg-primary text-primary-foreground hover:opacity-90 inline-flex h-7 cursor-pointer items-center gap-1 rounded-sm px-2 text-xs transition-opacity disabled:pointer-events-none disabled:opacity-50";

export default function PlatformRolePanel({
	canManage,
}: {
	canManage: boolean;
}) {
	const { data: roles, isLoading: rolesLoading } = useQuery({
		queryKey: ["manage-roles"],
		queryFn: listRoles,
	});
	const { data: permissions = [] } = useQuery({
		queryKey: ["manage-permissions"],
		queryFn: listPermissions,
	});

	const [selectedRole, setSelectedRole] = useState("");
	const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
	const [loadingPerms, setLoadingPerms] = useState(false);
	const [permsError, setPermsError] = useState("");
	const [permsReload, setPermsReload] = useState(0);
	const [saving, setSaving] = useState(false);
	const [newRoleName, setNewRoleName] = useState("");
	const [creating, setCreating] = useState(false);
	const [pendingDeleteRole, setPendingDeleteRole] = useState<Role | null>(null);
	const [deleting, setDeleting] = useState(false);

	const roleList: Role[] = roles ?? [];

	useEffect(() => {
		if (!roleList.length) return;
		if (!roleList.some((r) => r.name === selectedRole)) {
			setSelectedRole(roleList[0].name);
		}
	}, [roleList, selectedRole]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: permsReload 为有意触发器（保存/同步权限后重拉当前角色权限）
	useEffect(() => {
		const role = selectedRole;
		if (!role) return;
		setLoadingPerms(true);
		setPermsError("");
		getRolePermissions(role)
			.then((data) => {
				clearBackgroundFailure(`role-perms:${role}`);
				setSelectedCodes(new Set<string>(data.permissions));
			})
			.catch((error) => {
				setSelectedCodes(new Set<string>());
				setPermsError(
					reportBackgroundFailure(
						`role-perms:${role}`,
						error,
						"角色权限加载失败，请重新选择角色重试",
					),
				);
			})
			.finally(() => setLoadingPerms(false));
	}, [selectedRole, permsReload]);

	const toggle = (code: string, checked: boolean) => {
		setSelectedCodes((prev) => {
			const next = new Set(prev);
			if (checked) next.add(code);
			else next.delete(code);
			return next;
		});
	};

	const handleSave = async () => {
		if (!selectedRole || !canManage) return;
		setSaving(true);
		try {
			await syncRolePermissions(selectedRole, Array.from(selectedCodes));
			toast.success("平台权限已保存");
		} catch (error) {
			toastActionError(error, "保存权限失败");
		} finally {
			setSaving(false);
		}
	};

	const handleCreate = async () => {
		const name = newRoleName.trim();
		if (!name || !canManage) return;
		setCreating(true);
		try {
			await createRole(name);
			setNewRoleName("");
			setSelectedRole(name);
			toast.success(`角色「${name}」已创建`);
		} catch (error) {
			toastActionError(error, "创建角色失败");
		} finally {
			setCreating(false);
		}
	};

	const handleDelete = async () => {
		const role = pendingDeleteRole;
		if (!role || !canManage) return;
		setDeleting(true);
		try {
			await deleteRole(role.id);
			setPendingDeleteRole(null);
			toast.success(`角色「${roleLabel(role.name)}」已删除`);
		} catch (error) {
			toastActionError(error, "删除角色失败");
		} finally {
			setDeleting(false);
		}
	};

	const domainPerms = permissions.filter((p) => p.code.startsWith("domain:"));
	const otherPerms = permissions.filter((p) => !p.code.startsWith("domain:"));

	const renderPerms = (list: typeof permissions) =>
		list.map((perm) => (
			<label
				key={perm.code}
				className="border-border hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
			>
				<Checkbox
					checked={selectedCodes.has(perm.code)}
					onCheckedChange={(checked) => toggle(perm.code, checked === true)}
					disabled={!canManage}
				/>
				<span className="min-w-0">
					<span className="block truncate font-medium">{perm.name}</span>
					<span className="text-faint-foreground block truncate text-2xs">
						{perm.code}
					</span>
				</span>
			</label>
		));

	return (
		<div className="grid min-w-0 gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
			<ManageSection
				title="平台角色"
				actions={
					canManage ? (
						<div className="flex items-center gap-1.5">
							<input
								type="text"
								className="border-input bg-card text-foreground focus-visible:ring-ring placeholder:text-faint-foreground flex h-7 w-28 rounded-sm border px-2 text-xs focus-visible:outline-none focus-visible:ring-2"
								placeholder="新角色名"
								value={newRoleName}
								onChange={(e) => setNewRoleName(e.currentTarget.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") void handleCreate();
								}}
							/>
							<button
								type="button"
								className={btnXs}
								disabled={creating}
								onClick={() => void handleCreate()}
							>
								<Plus size={14} />
							</button>
						</div>
					) : undefined
				}
			>
				<div className="flex flex-col gap-1">
					{roleList.map((role) => (
						<div key={role.name} className="flex items-center gap-1">
							<button
								type="button"
								className={`hover:bg-muted flex flex-1 cursor-pointer items-center justify-start gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors ${selectedRole === role.name ? "bg-selected" : ""}`}
								onClick={() => setSelectedRole(role.name)}
							>
								<span className="truncate">{roleLabel(role.name)}</span>
								{SYSTEM_ROLES.has(role.name) && (
									<span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-1.5 text-2xs">
										系统
									</span>
								)}
							</button>
							{canManage && !SYSTEM_ROLES.has(role.name) && (
								<button
									type="button"
									className="text-destructive hover:bg-destructive/10 inline-flex size-7 cursor-pointer items-center justify-center rounded-sm transition-colors disabled:pointer-events-none disabled:opacity-50"
									disabled={deleting}
									onClick={() => setPendingDeleteRole(role)}
									aria-label={`删除角色 ${roleLabel(role.name)}`}
								>
									<Trash2 size={14} />
								</button>
							)}
						</div>
					))}
				</div>
			</ManageSection>

			<ManageSection
				title={`平台权限 — ${roleLabel(selectedRole)}`}
				description="平台级权限对所有域生效；域内角色权限请在「域内角色」页签配置"
				actions={
					canManage ? (
						<button
							type="button"
							className={btnXs}
							disabled={saving || loadingPerms || !!permsError}
							onClick={() => void handleSave()}
						>
							<Save size={14} />
							保存
						</button>
					) : undefined
				}
			>
				{permsError && (
					<div
						role="alert"
						className="border-destructive/40 bg-destructive/10 text-destructive mb-2 flex flex-wrap items-center gap-2 rounded-sm border px-3 py-2 text-xs"
					>
						<span>{permsError}（已禁用保存，避免把权限误清空）</span>
						<button
							type="button"
							className="underline underline-offset-2"
							onClick={() => setPermsReload((n) => n + 1)}
						>
							重试
						</button>
					</div>
				)}
				{loadingPerms || rolesLoading ? (
					<ManageLoading label="正在加载权限..." />
				) : permissions.length === 0 ? (
					<p className="text-faint-foreground px-3 py-2 text-sm">
						暂无可分配的权限
					</p>
				) : (
					<div className="flex flex-col gap-4">
						{domainPerms.length > 0 && (
							<div>
								<div className="text-muted-foreground mb-1.5 flex items-center gap-2 text-xs font-semibold">
									<span className="bg-primary h-3 w-0.5 rounded-full" />
									域管理（平台级）
									<span className="text-faint-foreground font-normal">
										对全部域生效 · {domainPerms.length} 项
									</span>
								</div>
								<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
									{renderPerms(domainPerms)}
								</div>
							</div>
						)}
						{otherPerms.length > 0 && (
							<div>
								<div className="text-muted-foreground mb-1.5 flex items-center gap-2 text-xs font-semibold">
									<span className="bg-primary h-3 w-0.5 rounded-full" />
									平台功能
									<span className="text-faint-foreground font-normal">
										{otherPerms.length} 项
									</span>
								</div>
								<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
									{renderPerms(otherPerms)}
								</div>
							</div>
						)}
					</div>
				)}
			</ManageSection>

			<ConfirmModal
				open={!!pendingDeleteRole}
				title="删除角色"
				message={`确认删除角色「${pendingDeleteRole ? roleLabel(pendingDeleteRole.name) : ""}」？该角色下已授予的权限会一并移除，此操作不可恢复。`}
				confirmText="删除"
				loading={deleting}
				onClose={() => setPendingDeleteRole(null)}
				onConfirm={() => void handleDelete()}
			/>
		</div>
	);
}
