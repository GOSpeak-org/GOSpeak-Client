import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	toast,
} from "@gospeak/components";
import { createFileRoute } from "@tanstack/react-router";
import {
	Clock,
	Gavel,
	Infinity as InfinityIcon,
	Search,
	Trash,
	UserCheck,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cancelMute, createMute, listMutes, type MuteRecord } from "@/api/mute";
import { deleteUser, listUsers, updateUserRole } from "@/api/user";
import type { BackendUser } from "@/api/auth";
import ConfirmModal from "@/components/common/ConfirmModal";
import MuteDurationPicker from "@/components/manage/MuteDurationPicker";
import {
	ManageHeader,
	ManagePage,
	ManageSection,
	ManageTag,
	manageTableHeadClass,
	manageTableRowClass,
} from "@/components/manage/ManageShell";
import {
	LoadingRegion,
	SkeletonTableRows,
} from "@/components/common/Skeletons";
import { useUserStore } from "@/stores/userStore";
import { formatRemaining } from "@/utils/format";
import { denyAccess } from "@/utils/accessDenied";
import {
	invalidateQueries,
	restoreQueries,
	runOptimistic,
	snapshotQueries,
	updateQueryData,
} from "@/utils/optimistic";
import { hasPermission } from "@/utils/permissions";
import { toastActionError } from "@/utils/toast";

const ROLES = ["user", "admin", "ban"];
const USER_PAGE_SIZE = 20;

function roleLabel(role: string) {
	if (role === "admin") return "管理员";
	if (role === "ban") return "封禁";
	return "用户";
}

export const Route = createFileRoute("/(app)/manage/users/")({
	beforeLoad: () => {
		if (!hasPermission("user:read")) {
			denyAccess();
		}
	},
	component: UsersPage,
	staticData: {
		title: "用户管理",
	},
});

const selectClass =
	"h-8 w-auto gap-1 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50";

// Radix Select 不允许空字符串作为 value，用哨兵值表示「未选择」
const NONE_USER = "__none__";

const iconBtnClass =
	"text-muted-foreground hover:bg-muted inline-flex size-11 min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-sm text-xs transition-colors disabled:pointer-events-none disabled:opacity-50";

function UsersPage() {
	const queryClient = useQueryClient();
	const canUpdateUser = hasPermission("user:update");
	const canDeleteUser = hasPermission("user:delete");
	const canManageMute = hasPermission("mute:manage");
	const selfUUID = useUserStore((s) => s.user?.uuid);

	const [userPage, setUserPage] = useState(1);
	const [userSearchInput, setUserSearchInput] = useState("");
	const [userKeyword, setUserKeyword] = useState("");
	const [confirmMute, setConfirmMute] = useState(false);
	const [muteError, setMuteError] = useState("");
	const [pendingBanUser, setPendingBanUser] = useState<BackendUser | null>(
		null,
	);
	const [banningRole, setBanningRole] = useState(false);
	const [banRoleError, setBanRoleError] = useState("");

	const { data: usersData, isLoading: usersLoading } = useQuery({
		queryKey: ["manage-users", userPage, userKeyword],
		queryFn: () =>
			listUsers(userPage, USER_PAGE_SIZE, true, userKeyword || undefined),
	});

	const { data: mutes = [], isLoading: mutesLoading } = useQuery({
		queryKey: ["manage-mutes", canManageMute],
		queryFn: () =>
			canManageMute ? listMutes() : Promise.resolve([] as MuteRecord[]),
	});

	const userTotal = usersData?.total ?? 0;
	const userTotalPages = Math.max(1, Math.ceil(userTotal / USER_PAGE_SIZE));

	useEffect(() => {
		if (userPage > userTotalPages) setUserPage(Math.max(1, userTotalPages));
	}, [userPage, userTotalPages]);

	const muteMap = new Map<string, MuteRecord>();
	for (const mute of mutes) {
		muteMap.set(mute.user_uuid, mute);
	}

	const USERS_KEY = ["manage-users"] as const;
	const MUTES_KEY = ["manage-mutes"] as const;
	const reconcile = () =>
		invalidateQueries(queryClient, [
			{ queryKey: USERS_KEY },
			{ queryKey: MUTES_KEY },
		]);
	type UserList = { users: BackendUser[]; total: number };

	const [muteUserId, setMuteUserId] = useState<string | "">("");
	const [muteDuration, setMuteDuration] = useState(3600);
	const [mutePerm, setMutePerm] = useState(false);
	const [muteReason, setMuteReason] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [cancellingId, setCancellingId] = useState<string | null>(null);
	const [deletingUser, setDeletingUser] = useState<BackendUser | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [deletingError, setDeletingError] = useState("");

	const users = (usersData?.users || []).filter((u) => !u.is_bot);
	const userMap = new Map<string, string>(
		users.map((u) => [u.uuid, u.display_name || u.name]),
	);

	const runRoleChange = async (
		userUUID: string,
		newRole: string,
		onError?: (message: string) => void,
		onSuccess?: () => void,
	) => {
		if (!canUpdateUser) return;
		await runOptimistic({
			snapshot: () => snapshotQueries(queryClient, [{ queryKey: USERS_KEY }]),
			apply: () =>
				updateQueryData<UserList>(
					queryClient,
					{ queryKey: USERS_KEY },
					(prev) => ({
						...prev,
						users: prev.users.map((u) =>
							u.uuid === userUUID ? { ...u, role: newRole } : u,
						),
					}),
				),
			restore: (snap) => restoreQueries(queryClient, snap),
			request: () => updateUserRole(userUUID, newRole),
			settle: reconcile,
			onError: (error) => {
				const message = toastActionError(error, "修改角色失败");
				onError?.(message);
			},
			onSuccess: () => {
				toast.success(`角色已改为${roleLabel(newRole)}`);
				onSuccess?.();
			},
		});
	};

	const handleRoleChange = (userUUID: string, newRole: string) => {
		if (!canUpdateUser) return;
		// 封禁与封禁页是同一高危操作，统一走确认弹窗而不是下拉框静默生效。
		if (newRole === "ban") {
			const target = usersData?.users?.find((u) => u.uuid === userUUID);
			setBanRoleError("");
			setPendingBanUser(target ?? ({ uuid: userUUID } as BackendUser));
			return;
		}
		void runRoleChange(userUUID, newRole);
	};

	const confirmBanRole = async () => {
		const target = pendingBanUser;
		if (!target) return;
		setBanningRole(true);
		try {
			await runRoleChange(target.uuid, "ban", setBanRoleError, () =>
				setPendingBanUser(null),
			);
		} finally {
			setBanningRole(false);
		}
	};

	const handleDeleteUser = async (userUUID: string) => {
		if (!canDeleteUser) return;
		// 统一走 ConfirmModal（原 window.confirm 与全站样式割裂，且不能显示对象名）
		const target = usersData?.users?.find((u) => u.uuid === userUUID);
		setDeletingError("");
		setDeletingUser(target ?? ({ uuid: userUUID } as BackendUser));
	};

	const confirmDeleteUser = async () => {
		const target = deletingUser;
		if (!target) return;
		setDeletingError("");
		setDeleting(true);
		try {
			await runOptimistic({
				snapshot: () =>
					snapshotQueries(queryClient, [
						{ queryKey: USERS_KEY },
						{ queryKey: MUTES_KEY },
					]),
				apply: () =>
					updateQueryData<UserList>(
						queryClient,
						{ queryKey: USERS_KEY },
						(prev) => ({
							users: prev.users.filter((u) => u.uuid !== target.uuid),
							total: Math.max(0, prev.total - 1),
						}),
					),
				restore: (snap) => restoreQueries(queryClient, snap),
				request: () => deleteUser(target.uuid),
				settle: reconcile,
				onError: (error) =>
					setDeletingError(toastActionError(error, "删除用户失败")),
				onSuccess: () => {
					toast.success("用户已删除");
					setDeletingUser(null);
				},
			});
		} finally {
			setDeleting(false);
		}
	};

	const handleMute = async () => {
		const uid = muteUserId;
		if (!uid) return;
		if (!mutePerm && muteDuration <= 0) return;
		setMuteError("");
		setSubmitting(true);
		const now = new Date().toISOString();
		const optimisticRecord: MuteRecord = {
			id: 0,
			uuid: `optimistic-${uid}`,
			user_uuid: uid,
			muter_uuid: "",
			duration: muteDuration,
			permanent: mutePerm,
			expires_at: mutePerm
				? null
				: new Date(Date.now() + muteDuration * 1000).toISOString(),
			reason: muteReason,
			created_at: now,
			updated_at: now,
		};
		try {
			await runOptimistic({
				snapshot: () => snapshotQueries(queryClient, [{ queryKey: MUTES_KEY }]),
				apply: () =>
					updateQueryData<MuteRecord[]>(
						queryClient,
						{ queryKey: MUTES_KEY },
						(prev) => [
							...prev.filter((m) => m.user_uuid !== uid),
							optimisticRecord,
						],
					),
				restore: (snap) => restoreQueries(queryClient, snap),
				request: () =>
					createMute({
						user_uuid: uid,
						duration: muteDuration,
						permanent: mutePerm,
						reason: muteReason,
					}),
				settle: reconcile,
				onError: (error) => setMuteError(toastActionError(error, "禁言失败")),
				onSuccess: () => {
					setConfirmMute(false);
					setMuteUserId("");
					setMuteDuration(3600);
					setMutePerm(false);
					setMuteReason("");
					toast.success(mutePerm ? "已永久禁言该用户" : "用户已被禁言");
				},
			});
		} finally {
			setSubmitting(false);
		}
	};

	const handleCancelMute = async (uid: string) => {
		setCancellingId(uid);
		try {
			await runOptimistic({
				snapshot: () => snapshotQueries(queryClient, [{ queryKey: MUTES_KEY }]),
				apply: () =>
					updateQueryData<MuteRecord[]>(
						queryClient,
						{ queryKey: MUTES_KEY },
						(prev) => prev.filter((m) => m.user_uuid !== uid),
					),
				restore: (snap) => restoreQueries(queryClient, snap),
				request: () => cancelMute(uid),
				settle: reconcile,
				onError: (error) => toastActionError(error, "解除禁言失败"),
				onSuccess: () => toast.success("已解除禁言"),
			});
		} finally {
			setCancellingId(null);
		}
	};

	return (
		<ManagePage>
			<ManageHeader
				icon={<Users size={20} />}
				title="用户管理"
				description="查看用户、调整角色，并快速处理禁言"
			/>

			<ManageSection
				title="用户列表"
				description={`共 ${userTotal} 人`}
				padded={false}
			>
				<div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
					<form
						className="flex min-w-72 flex-1 items-center gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							setUserPage(1);
							setUserKeyword(userSearchInput.trim());
						}}
					>
						<label className="border-input bg-card flex h-9 min-w-0 flex-1 items-center gap-2 rounded-sm border px-3">
							<Search size={14} className="text-faint-foreground shrink-0" />
							<input
								type="search"
								className="min-w-0 grow bg-transparent text-sm outline-none"
								placeholder="搜索用户名、显示名、邮箱"
								value={userSearchInput}
								onChange={(e) => setUserSearchInput(e.currentTarget.value)}
							/>
						</label>
						<Button type="submit" variant="outline">
							搜索
						</Button>
					</form>
					<span className="text-faint-foreground text-xs">
						第 {userPage} / {userTotalPages} 页
					</span>
				</div>
				<div className="overflow-x-auto">
					{usersLoading ? (
						<LoadingRegion label="正在加载用户">
							<SkeletonTableRows rows={8} cols={6} />
						</LoadingRegion>
					) : users.length === 0 ? (
						<div className="border-border bg-muted/40 text-faint-foreground m-4 rounded-lg border border-dashed py-10 text-center text-sm">
							暂无用户
						</div>
					) : (
						<table className="w-full min-w-max text-sm">
							<thead>
								<tr className={manageTableHeadClass}>
									<th className="w-16 px-3 py-2 text-left">ID</th>
									<th className="px-3 py-2 text-left">用户名</th>
									<th className="px-3 py-2 text-left">显示名</th>
									<th className="w-24 px-3 py-2 text-left">角色</th>
									{canManageMute && (
										<th className="w-28 px-3 py-2 text-left">禁言</th>
									)}
									<th className="w-48 px-3 py-2 text-left">操作</th>
								</tr>
							</thead>
							<tbody>
								{users.map((user) => {
									const mute = muteMap.get(user.uuid);
									const muted = !!mute;
									const isSelf = selfUUID === user.uuid;
									return (
										<tr
											key={user.uuid}
											className={`${manageTableRowClass} ${muted ? "bg-muted/40" : ""}`}
										>
											<td className="text-muted-foreground px-3 py-2 font-mono text-xs">
												{user.uuid.slice(0, 8)}
											</td>
											<td className="px-3 py-2">
												<div className="text-foreground font-medium">
													{user.name}
												</div>
											</td>
											<td className="text-muted-foreground px-3 py-2">
												{user.display_name || "—"}
											</td>
											<td className="px-3 py-2">
												<ManageTag>{roleLabel(user.role)}</ManageTag>
											</td>
											{canManageMute && (
												<td className="px-3 py-2">
													{muted ? (
														<ManageTag>
															<span className="inline-flex items-center gap-1">
																{mute?.permanent ? (
																	<InfinityIcon size={12} />
																) : (
																	<Clock size={12} />
																)}
																{mute?.permanent
																	? "永久"
																	: formatRemaining(mute?.expires_at ?? null)}
															</span>
														</ManageTag>
													) : (
														<ManageTag>正常</ManageTag>
													)}
												</td>
											)}
											<td className="px-3 py-2">
												<div className="flex items-center gap-1.5">
													{canUpdateUser && (
														<Select
															value={user.role}
															disabled={isSelf}
															onValueChange={(next) =>
																void handleRoleChange(user.uuid, next)
															}
														>
															<SelectTrigger
																className={selectClass}
																aria-label={`角色 ${user.display_name || user.name}`}
															>
																<SelectValue placeholder="—" />
															</SelectTrigger>
															<SelectContent>
																{ROLES.map((r) => (
																	<SelectItem key={r} value={r}>
																		{roleLabel(r)}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													)}
													{canManageMute &&
														(muted ? (
															<button
																type="button"
																className={iconBtnClass}
																title="解除禁言"
																disabled={cancellingId === user.uuid}
																onClick={() => void handleCancelMute(user.uuid)}
															>
																<UserCheck size={14} />
															</button>
														) : (
															<button
																type="button"
																className={iconBtnClass}
																title="禁言"
																onClick={() => {
																	setMuteUserId(user.uuid);
																	setMutePerm(false);
																	setMuteDuration(3600);
																}}
															>
																<Gavel size={14} />
															</button>
														))}
													{canDeleteUser && !isSelf && (
														<button
															type="button"
															className={iconBtnClass}
															title="删除用户"
															onClick={() => void handleDeleteUser(user.uuid)}
														>
															<Trash size={14} />
														</button>
													)}
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					)}
				</div>
				<div className="border-border flex items-center justify-between gap-3 border-t px-4 py-3">
					<span className="text-faint-foreground text-xs">
						共 {userTotal} 人
					</span>
					<div className="flex items-center gap-1.5">
						<button
							type="button"
							className="hover:bg-muted inline-flex h-7 cursor-pointer items-center rounded-sm px-2 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50"
							disabled={userPage <= 1}
							onClick={() => setUserPage(Math.max(1, userPage - 1))}
						>
							上一页
						</button>
						<button
							type="button"
							className="hover:bg-muted inline-flex h-7 cursor-pointer items-center rounded-sm px-2 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50"
							disabled={userPage >= userTotalPages}
							onClick={() => setUserPage(userPage + 1)}
						>
							下一页
						</button>
					</div>
				</div>
			</ManageSection>

			{canManageMute && (
				<>
					<ManageSection
						title="快速禁言"
						description="选择用户与时长后立即生效"
						actions={
							<Button
								type="button"
								variant="destructive"
								disabled={!muteUserId || submitting}
								onClick={() => setConfirmMute(true)}
							>
								<Gavel size={16} />
								确认禁言
							</Button>
						}
					>
						<div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(280px,340px)_minmax(220px,280px)_minmax(200px,260px)]">
							<div>
								<label
									className="text-muted-foreground mb-1 block py-1 text-xs font-medium"
									htmlFor="mute-user"
								>
									用户
								</label>
								<Select
									value={muteUserId === "" ? NONE_USER : muteUserId}
									onValueChange={(next) =>
										setMuteUserId(next === NONE_USER ? "" : next)
									}
								>
									<SelectTrigger id="mute-user" className="h-9">
										<SelectValue placeholder="选择用户" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NONE_USER}>选择用户</SelectItem>
										{users.map((u) => (
											<SelectItem key={u.uuid || u.id} value={u.uuid}>
												{u.display_name || u.name} ({u.name})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<div className="border-border bg-muted/40 text-muted-foreground mt-3 rounded-lg border px-3 py-2 text-xs">
									{muteUserId
										? `将禁言：${userMap.get(muteUserId) ?? `#${muteUserId}`}`
										: "请先选择要禁言的用户"}
								</div>
							</div>

							<div className="min-w-0">
								<div className="text-muted-foreground mb-1 py-1 text-xs font-medium">
									禁言时长
								</div>
								<MuteDurationPicker
									permanent={mutePerm}
									duration={muteDuration}
									onChange={(value) => {
										setMutePerm(value.permanent);
										setMuteDuration(value.duration);
									}}
								/>
							</div>

							<div>
								<label
									className="text-muted-foreground mb-1 block py-1 text-xs font-medium"
									htmlFor="mute-reason"
								>
									原因
								</label>
								<input
									id="mute-reason"
									type="text"
									className="border-input bg-card text-foreground focus-visible:ring-ring placeholder:text-faint-foreground flex h-9 w-full rounded-sm border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
									placeholder="违规发言"
									value={muteReason}
									onChange={(e) => setMuteReason(e.currentTarget.value)}
								/>
							</div>
						</div>
					</ManageSection>

					<ManageSection
						title="活跃禁言"
						description={`${mutes.length || 0} 条`}
						padded={false}
					>
						{mutesLoading ? (
							<LoadingRegion label="正在加载活跃禁言">
								<SkeletonTableRows rows={4} cols={4} />
							</LoadingRegion>
						) : mutes.length === 0 ? (
							<div className="border-border bg-muted/40 text-faint-foreground m-4 rounded-lg border border-dashed py-10 text-center text-sm">
								暂无活跃禁言
							</div>
						) : (
							<div className="overflow-x-auto">
								<table className="w-full min-w-max text-sm">
									<thead>
										<tr className={manageTableHeadClass}>
											<th className="px-3 py-2 text-left">用户</th>
											<th className="w-20 px-3 py-2 text-left">类型</th>
											<th className="w-32 px-3 py-2 text-left">剩余时间</th>
											<th className="px-3 py-2 text-left">原因</th>
											<th className="w-32 px-3 py-2 text-left">操作者</th>
											<th className="w-24 px-3 py-2 text-left">操作</th>
										</tr>
									</thead>
									<tbody>
										{mutes.map((mute) => (
											<tr key={mute.user_uuid} className={manageTableRowClass}>
												<td className="px-3 py-2 font-medium">
													{userMap.get(mute.user_uuid) || `#${mute.user_uuid}`}
												</td>
												<td className="px-3 py-2">
													<ManageTag>
														{mute.permanent ? "永久" : "定时"}
													</ManageTag>
												</td>
												<td className="text-muted-foreground px-3 py-2 text-sm">
													{mute.permanent
														? "—"
														: formatRemaining(mute.expires_at ?? null)}
												</td>
												<td className="text-muted-foreground max-w-48 truncate px-3 py-2 text-sm">
													{mute.reason || "—"}
												</td>
												<td className="text-muted-foreground px-3 py-2 text-sm">
													{userMap.get(mute.muter_uuid) ||
														`#${mute.muter_uuid}`}
												</td>
												<td className="px-3 py-2">
													<button
														type="button"
														className="text-muted-foreground hover:bg-muted inline-flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50"
														disabled={cancellingId === mute.user_uuid}
														onClick={() =>
															void handleCancelMute(mute.user_uuid)
														}
													>
														<UserCheck size={14} />
														解除
													</button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</ManageSection>
				</>
			)}

			<ConfirmModal
				open={!!deletingUser}
				title="删除用户"
				message={
					<span>
						确认删除用户
						{deletingUser
							? `「${deletingUser.display_name || deletingUser.name}」`
							: ""}
						？该用户的账号与登录凭据将被永久移除，此操作不可恢复。
						{deletingError && (
							<span className="text-destructive mt-2 block">
								{deletingError}
							</span>
						)}
					</span>
				}
				confirmText="永久删除"
				confirmPhrase={
					deletingUser
						? deletingUser.display_name || deletingUser.name
						: undefined
				}
				loading={deleting}
				onClose={() => {
					setDeletingUser(null);
					setDeletingError("");
				}}
				onConfirm={confirmDeleteUser}
			/>

			<ConfirmModal
				open={confirmMute}
				title="禁言用户"
				message={
					<span>
						确认对「
						{userMap.get(muteUserId) ?? `#${muteUserId}`}」
						{mutePerm
							? "永久禁言"
							: `禁言 ${Math.max(1, Math.round(muteDuration / 60))} 分钟`}
						？该用户在禁言期间无法发言，可在下方列表提前解除。
						{muteError && (
							<span className="text-destructive mt-2 block">{muteError}</span>
						)}
					</span>
				}
				confirmText="禁言"
				loading={submitting}
				onClose={() => {
					setConfirmMute(false);
					setMuteError("");
				}}
				onConfirm={handleMute}
			/>

			<ConfirmModal
				open={!!pendingBanUser}
				title="封禁用户"
				message={
					<span>
						确认封禁「
						{pendingBanUser?.display_name ||
							pendingBanUser?.name ||
							`#${pendingBanUser?.uuid.slice(0, 8) ?? ""}`}
						」？封禁后该用户无法登录与访问，请在「封禁管理」页解除。
						{banRoleError && (
							<span className="text-destructive mt-2 block">
								{banRoleError}
							</span>
						)}
					</span>
				}
				confirmText="封禁"
				loading={banningRole}
				onClose={() => {
					setPendingBanUser(null);
					setBanRoleError("");
				}}
				onConfirm={confirmBanRole}
			/>
		</ManagePage>
	);
}
