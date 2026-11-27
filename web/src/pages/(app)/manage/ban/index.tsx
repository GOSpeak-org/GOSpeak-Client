import { Button, toast } from "@gospeak/components";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Ban, UserCheck } from "lucide-react";
import { useState } from "react";
import { listUsers, updateUserRole } from "@/api/user";
import type { BackendUser } from "@/api/auth";
import {
	ManageHeader,
	ManagePage,
	ManageSection,
	manageTableHeadClass,
	manageTableRowClass,
} from "@/components/manage/ManageShell";
import {
	LoadingRegion,
	SkeletonTableRows,
} from "@/components/common/Skeletons";
import UserSearchSelect from "@/components/manage/UserSearchSelect";
import ConfirmModal from "@/components/common/ConfirmModal";
import {
	invalidateQueries,
	restoreQueries,
	runOptimistic,
	snapshotQueries,
	updateQueryData,
} from "@/utils/optimistic";
import { toastActionError } from "@/utils/toast";
import { denyAccess } from "@/utils/accessDenied";
import { hasPermission } from "@/utils/permissions";

const BAN_ROLE = "ban";
const USER_ROLE = "user";

export const Route = createFileRoute("/(app)/manage/ban/")({
	beforeLoad: () => {
		if (!hasPermission("user:update")) {
			denyAccess();
		}
	},
	component: BanPage,
	staticData: {
		title: "封禁管理",
	},
});

export default function BanPage() {
	const queryClient = useQueryClient();
	const [userSearch, setUserSearch] = useState("");
	const [userQuery, setUserQuery] = useState("");
	const { data: usersData, isLoading } = useQuery({
		queryKey: ["manage-ban-user-search", userQuery],
		queryFn: () => listUsers(1, 50, true, userQuery || undefined),
	});
	const [targetUUID, setTargetUUID] = useState<string | "">("");
	const [banning, setBanning] = useState(false);
	const [confirmBan, setConfirmBan] = useState(false);
	const [banError, setBanError] = useState("");
	const [unbanningUUID, setUnbanningUUID] = useState<string | null>(null);

	const allUsers = usersData?.users || [];
	const bannedUsers = allUsers.filter((u) => u.role === BAN_ROLE);
	const normalUsers = allUsers.filter((u) => u.role !== BAN_ROLE);
	const targetUser = normalUsers.find((u) => u.uuid === targetUUID);

	type UserList = { users: BackendUser[]; total: number };
	const BAN_SEARCH_KEY = ["manage-ban-user-search"] as const;
	const USERS_KEY = ["manage-users"] as const;
	const snapshot = () =>
		snapshotQueries(queryClient, [
			{ queryKey: BAN_SEARCH_KEY },
			{ queryKey: USERS_KEY },
		]);
	const setRole = (uuid: string, role: string) => {
		for (const key of [BAN_SEARCH_KEY, USERS_KEY]) {
			updateQueryData<UserList>(queryClient, { queryKey: key }, (prev) => ({
				...prev,
				users: prev.users.map((u) => (u.uuid === uuid ? { ...u, role } : u)),
			}));
		}
	};
	const reconcile = () =>
		invalidateQueries(queryClient, [
			{ queryKey: BAN_SEARCH_KEY },
			{ queryKey: USERS_KEY },
		]);

	const handleBan = async () => {
		const uuid = targetUUID;
		if (!uuid) return;
		setBanError("");
		setBanning(true);
		try {
			await runOptimistic({
				snapshot,
				apply: () => setRole(uuid, BAN_ROLE),
				restore: (snap) => restoreQueries(queryClient, snap),
				request: () => updateUserRole(uuid, BAN_ROLE),
				settle: reconcile,
				onError: (error) => setBanError(toastActionError(error, "封禁失败")),
				onSuccess: () => {
					setConfirmBan(false);
					setTargetUUID("");
					toast.success("用户已封禁");
				},
			});
		} finally {
			setBanning(false);
		}
	};

	const handleUnban = async (uuid: string) => {
		setUnbanningUUID(uuid);
		try {
			await runOptimistic({
				snapshot,
				apply: () => setRole(uuid, USER_ROLE),
				restore: (snap) => restoreQueries(queryClient, snap),
				request: () => updateUserRole(uuid, USER_ROLE),
				settle: reconcile,
				onError: (error) => toastActionError(error, "解除封禁失败"),
				onSuccess: () => toast.success("已解除封禁"),
			});
		} finally {
			setUnbanningUUID(null);
		}
	};

	return (
		<ManagePage>
			<ManageHeader
				icon={<Ban size={20} />}
				title="封禁管理"
				description="封禁后用户无法登录与访问"
			/>

			<ManageSection
				title="已封禁用户"
				description={`${bannedUsers.length} 人`}
				padded={false}
			>
				{isLoading ? (
					<LoadingRegion label="正在加载封禁用户">
						<SkeletonTableRows rows={4} cols={4} />
					</LoadingRegion>
				) : bannedUsers.length === 0 ? (
					<div className="border-border bg-muted/40 text-faint-foreground m-4 rounded-lg border border-dashed py-10 text-center text-sm">
						暂无封禁用户
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-max text-sm">
							<thead>
								<tr className={manageTableHeadClass}>
									<th className="px-3 py-2 text-left">ID</th>
									<th className="px-3 py-2 text-left">用户名</th>
									<th className="px-3 py-2 text-left">显示名</th>
									<th className="px-3 py-2 text-left">操作</th>
								</tr>
							</thead>
							<tbody>
								{bannedUsers.map((user) => (
									<tr key={user.uuid} className={manageTableRowClass}>
										<td className="text-muted-foreground px-3 py-2 font-mono text-xs">
											{user.uuid.slice(0, 8)}
										</td>
										<td className="px-3 py-2 font-semibold">{user.name}</td>
										<td className="text-foreground px-3 py-2">
											{user.display_name || "—"}
										</td>
										<td className="px-3 py-2">
											<button
												type="button"
												className="text-muted-foreground hover:bg-muted inline-flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50"
												disabled={unbanningUUID === user.uuid}
												onClick={() => void handleUnban(user.uuid)}
											>
												<UserCheck size={14} />
												解除封禁
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</ManageSection>

			<ManageSection title="添加封禁" description="将用户角色设为 ban">
				<div className="flex flex-wrap items-end gap-3">
					<UserSearchSelect
						id="ban-user"
						value={targetUUID}
						onChange={(v) => setTargetUUID(String(v))}
						users={normalUsers}
						loading={isLoading}
						disabled={banning}
						searchValue={userSearch}
						onSearchInput={setUserSearch}
						onSearch={() => setUserQuery(userSearch.trim())}
					/>
					<Button
						type="button"
						variant="destructive"
						disabled={!targetUUID || banning}
						onClick={() => setConfirmBan(true)}
					>
						<Ban size={16} />
						确认封禁
					</Button>
				</div>
			</ManageSection>

			<ConfirmModal
				open={confirmBan}
				title="封禁用户"
				message={
					<span>
						确认封禁「
						{targetUser?.display_name ||
							targetUser?.name ||
							`#${targetUUID.slice(0, 8)}`}
						」？封禁后该用户无法登录与访问，可在上方列表解除。
						{banError && (
							<span className="text-destructive mt-2 block">{banError}</span>
						)}
					</span>
				}
				confirmText="封禁"
				loading={banning}
				onClose={() => {
					setConfirmBan(false);
					setBanError("");
				}}
				onConfirm={handleBan}
			/>
		</ManagePage>
	);
}
