import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	toast,
} from "@gospeak/components";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import {
	type DomainDetail,
	type DomainRole,
	createDomainRole,
	deleteDomainRole,
	domainMembers,
	getMyDomainsDetailed,
	listDomainRoles,
	updateDomainMemberRole,
	updateDomainRolePermissions,
} from "@/api/domain";
import ConfirmModal from "@/components/common/ConfirmModal";
import DomainMemberTable from "@/components/domain/DomainMemberTable";
import DomainRolePanel from "@/components/manage/DomainRolePanel";
import {
	ManageLoading,
	ManageNotice,
	ManageSection,
} from "@/components/manage/ManageShell";
import { useUserStore } from "@/stores/userStore";
import { apiErrorMessage } from "@/utils/apiError";
import { hasDomainPermission } from "@/utils/domainPermissions";
import { hasPermission } from "@/utils/permissions";
import { toastActionError } from "@/utils/toast";

export default function DomainPermissionPanel() {
	const queryClient = useQueryClient();
	const currentUser = useUserStore((s) => s.user);
	const { data: domains = [], isLoading: domainsLoading } = useQuery({
		queryKey: ["my-domains-detailed"],
		queryFn: getMyDomainsDetailed,
	});
	const [selectedUUID, setSelectedUUID] = useState("");
	const domain: DomainDetail | undefined =
		domains.find((d) => d.uuid === selectedUUID) ?? domains[0];
	const domainUUID = domain?.uuid ?? "";

	const rolesQuery = useQuery({
		queryKey: ["domain-roles", domainUUID],
		queryFn: () => listDomainRoles(domainUUID),
		enabled: !!domainUUID,
	});
	const membersQuery = useQuery({
		queryKey: ["domain-members", domainUUID],
		queryFn: () => domainMembers(domainUUID),
		enabled: !!domainUUID,
	});

	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [pendingDeleteRole, setPendingDeleteRole] = useState<string | null>(
		null,
	);

	const canManageRoles =
		hasPermission("domain:manage") ||
		(!!domainUUID && hasDomainPermission(domainUUID, "domain:role:manage")) ||
		(!!currentUser && domain?.owner_uuid === currentUser.uuid);
	const canChangeMemberRole =
		canManageRoles ||
		(!!domainUUID && hasDomainPermission(domainUUID, "domain:manage"));

	const refresh = async () => {
		setError("");
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["domain-roles", domainUUID] }),
			queryClient.invalidateQueries({
				queryKey: ["domain-members", domainUUID],
			}),
		]);
	};

	const withMutation = async (fn: () => Promise<void>, ok: string) => {
		setSaving(true);
		setError("");
		try {
			await fn();
			await refresh();
			toast.success(ok);
		} catch (e) {
			setError(apiErrorMessage(e));
			toastActionError(e, ok.replace("已", ""));
		} finally {
			setSaving(false);
		}
	};

	const onCreateRole = (name: string, permissions: string[]) =>
		withMutation(
			() => createDomainRole(domainUUID, name, permissions),
			`角色「${name}」已创建`,
		);
	const onUpdateRole = (roleName: string, permissions: string[]) =>
		withMutation(
			() => updateDomainRolePermissions(domainUUID, roleName, permissions),
			"角色权限已保存",
		);
	const onDeleteRole = (roleName: string) =>
		withMutation(
			() => deleteDomainRole(domainUUID, roleName),
			`角色「${roleName}」已删除`,
		);
	const onChangeMemberRole = (userUUID: string, roleName: string) =>
		withMutation(
			() => updateDomainMemberRole(domainUUID, userUUID, roleName),
			"成员角色已更新",
		);

	if (domainsLoading) {
		return <ManageLoading label="正在加载域列表..." />;
	}
	if (domains.length === 0) {
		return (
			<ManageNotice>
				你还没有加入任何语音域。域内角色与成员权限需要先加入一个域才能配置。
			</ManageNotice>
		);
	}

	const refreshing = rolesQuery.isFetching || membersQuery.isFetching;

	return (
		<div className="flex min-w-0 flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground text-xs">当前域</span>
					<Select
						value={domainUUID}
						onValueChange={(next) => setSelectedUUID(next)}
					>
						<SelectTrigger
							className="h-8 w-auto min-w-40 gap-2 px-3 text-sm"
							aria-label="选择域"
						>
							<SelectValue placeholder="选择域" />
						</SelectTrigger>
						<SelectContent>
							{domains.map((d) => (
								<SelectItem key={d.uuid} value={d.uuid}>
									{d.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Button
					variant="outline"
					size="sm"
					className="text-muted-foreground"
					disabled={saving || refreshing}
					onClick={() => void refresh()}
				>
					<RefreshCw
						size={14}
						className={refreshing ? "animate-spin" : undefined}
					/>
					{refreshing ? "刷新中" : "刷新"}
				</Button>
			</div>

			{error && (
				<div
					role="alert"
					className="border-destructive/40 bg-destructive/10 text-destructive rounded-sm border px-3 py-2 text-xs"
				>
					{error}
				</div>
			)}

			<DomainRolePanel
				layout="sections"
				roles={rolesQuery.data?.roles ?? []}
				assignable={rolesQuery.data?.assignable ?? []}
				loading={rolesQuery.isLoading}
				saving={saving}
				error={rolesQuery.isError ? apiErrorMessage(rolesQuery.error) : ""}
				onCreate={onCreateRole}
				onUpdate={onUpdateRole}
				onDelete={(roleName) => {
					setPendingDeleteRole(roleName);
					return Promise.resolve();
				}}
			/>

			<ManageSection
				title="成员角色分配"
				description={`共 ${membersQuery.data?.length ?? 0} 位成员`}
				padded={false}
			>
				<DomainMemberTable
					members={membersQuery.data ?? []}
					ownerUUID={domain?.owner_uuid}
					currentUserUUID={currentUser?.uuid}
					canKick={false}
					loading={membersQuery.isLoading}
					refreshing={membersQuery.isFetching}
					error={
						membersQuery.isError ? apiErrorMessage(membersQuery.error) : null
					}
					roles={(rolesQuery.data?.roles ?? []).map((r: DomainRole) => r.name)}
					canChangeRole={canChangeMemberRole}
					onChangeRole={(userUUID, roleName) =>
						void onChangeMemberRole(userUUID, roleName)
					}
					onKick={() => {}}
				/>
			</ManageSection>

			<ConfirmModal
				open={!!pendingDeleteRole}
				title="删除角色"
				message={`确认删除角色「${pendingDeleteRole ?? ""}」？该角色的权限配置会一并移除。`}
				confirmText="删除"
				loading={saving}
				onClose={() => setPendingDeleteRole(null)}
				onConfirm={() => {
					const role = pendingDeleteRole;
					setPendingDeleteRole(null);
					if (role) void onDeleteRole(role);
				}}
			/>
		</div>
	);
}
