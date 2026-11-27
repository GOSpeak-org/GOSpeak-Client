import { Button, Checkbox, Input } from "@gospeak/components";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { MousePointerClick, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import type { DomainRole } from "@/api/domain";
import { listPermissions } from "@/api/permission";
import { ManageSection } from "@/components/manage/ManageShell";

const PERMISSION_GROUP_LABELS: Record<string, string> = {
	domain: "域",
	room: "房间",
	message: "消息",
};

function groupPermissions(codes: string[]) {
	const groups = new Map<string, string[]>();
	for (const code of codes) {
		const prefix = code.split(":")[0] || "other";
		const list = groups.get(prefix) ?? [];
		list.push(code);
		groups.set(prefix, list);
	}
	return Array.from(groups, ([prefix, items]) => ({
		prefix,
		label: PERMISSION_GROUP_LABELS[prefix] ?? prefix,
		items,
	}));
}

/**
 * 域内角色与权限配置。
 *
 * layout="panel"（默认）：裸双列内容，供外层 ManageSection 包裹（域详情页用）。
 * layout="sections"：自带左右两张 ManageSection 卡片，与「平台角色」页签同构
 * （左：角色列表 + 头部创建控件；右：权限卡片 + 头部保存按钮）。
 */
export default function DomainRolePanel(props: {
	roles: DomainRole[];
	assignable: string[];
	loading: boolean;
	saving: boolean;
	error: string;
	onCreate: (name: string, permissions: string[]) => Promise<void>;
	onUpdate: (roleName: string, permissions: string[]) => Promise<void>;
	onDelete: (roleName: string) => Promise<void>;
	layout?: "panel" | "sections";
}) {
	const layout = props.layout ?? "panel";
	const [selected, setSelected] = useState("");
	const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
	const [newRoleName, setNewRoleName] = useState("");

	// 权限码 → 显示名；与「平台角色」页签共用同一份权限字典缓存
	const { data: permissions = [] } = useQuery({
		queryKey: ["manage-permissions"],
		queryFn: listPermissions,
	});
	const permName = (code: string) =>
		permissions.find((p) => p.code === code)?.name;

	const selectRole = (role: DomainRole) => {
		setSelected(role.name);
		setSelectedCodes(new Set(role.permissions));
	};

	const toggle = (code: string, checked: boolean) => {
		const next = new Set(selectedCodes);
		if (checked) next.add(code);
		else next.delete(code);
		setSelectedCodes(next);
	};

	const isFixedRole = () => selected === "owner" || selected === "admin";

	const save = async () => {
		if (!selected) return;
		await props.onUpdate(selected, Array.from(selectedCodes));
	};

	const createRole = () => {
		const name = newRoleName.trim();
		if (!name || props.saving) return;
		void props.onCreate(name, Array.from(selectedCodes));
		setNewRoleName("");
	};

	// 与「平台角色」页签一致的小尺寸创建控件（Enter 直提）
	const createControls = (
		<>
			<Input
				className="h-7 w-28 px-2 text-xs"
				placeholder="新角色名"
				value={newRoleName}
				onChange={(e) => setNewRoleName(e.currentTarget.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") createRole();
				}}
			/>
			<Button
				type="button"
				size="xs"
				aria-label="创建角色"
				disabled={!newRoleName.trim() || props.saving}
				onClick={createRole}
			>
				<Plus size={14} />
			</Button>
		</>
	);

	const roleList = (
		<div className="flex flex-col gap-1">
			{props.loading && props.roles.length === 0 && (
				<div className="text-muted-foreground px-3 py-2 text-sm">
					正在加载角色…
				</div>
			)}
			{!props.loading && props.roles.length === 0 && (
				<div className="text-faint-foreground px-3 py-2 text-sm">
					暂无自定义角色
				</div>
			)}
			{props.roles.map((role) => (
				<div key={role.name} className="flex items-center gap-1">
					<button
						type="button"
						className={`hover:bg-muted flex flex-1 cursor-pointer items-center justify-start gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors ${selected === role.name ? "bg-selected" : ""}`}
						onClick={() => selectRole(role)}
					>
						<span className="truncate">{role.name}</span>
						{role.is_system && (
							<span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-1.5 text-2xs">
								系统
							</span>
						)}
					</button>
					{!role.is_system && (
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label={`删除角色 ${role.name}`}
							className="text-destructive hover:bg-destructive/10"
							disabled={props.saving}
							onClick={() => void props.onDelete(role.name)}
						>
							<Trash2 size={14} />
						</Button>
					)}
				</div>
			))}
		</div>
	);

	const errorAlert = props.error && (
		<div
			role="alert"
			className="border-destructive/50 bg-destructive/10 text-destructive mb-3 flex items-center rounded-sm px-3 py-2 text-sm"
		>
			<span>{props.error}</span>
		</div>
	);

	const permissionBody = !selected ? (
		<div className="text-faint-foreground flex min-h-48 flex-col items-center justify-center gap-2 text-sm">
			<MousePointerClick className="text-faint-foreground size-5" />
			从左侧选择角色进行权限配置
		</div>
	) : (
		<div className="flex flex-col gap-3">
			{groupPermissions(props.assignable).map((group) => (
				<div key={group.prefix}>
					<div className="text-muted-foreground mb-1.5 flex items-center gap-2 text-xs font-semibold">
						<span className="bg-primary h-3 w-0.5 rounded-full" />
						{group.label}
						<span className="text-faint-foreground font-normal">
							{group.items.length} 项
						</span>
					</div>
					<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{group.items.map((code) => {
							const checked = selectedCodes.has(code);
							const name = permName(code);
							return (
								<label
									key={code}
									className={clsx(
										"border-border hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
										isFixedRole() && "cursor-not-allowed",
									)}
								>
									<Checkbox
										checked={checked}
										disabled={isFixedRole()}
										onCheckedChange={(next) => toggle(code, next === true)}
									/>
									<span className="min-w-0">
										<span className="block truncate font-medium">
											{name ?? code}
										</span>
										{name && name !== code && (
											<span className="text-faint-foreground block truncate font-mono text-2xs">
												{code}
											</span>
										)}
									</span>
								</label>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);

	if (layout === "sections") {
		return (
			<div className="grid min-w-0 gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
				<ManageSection
					title="域内角色"
					actions={
						<div className="flex items-center gap-1.5">{createControls}</div>
					}
				>
					{roleList}
				</ManageSection>
				<ManageSection
					title={selected ? `域内权限 — ${selected}` : "域内权限"}
					description="仅对该域生效；平台级权限请在「平台角色」页签配置"
					actions={
						<Button
							type="button"
							size="xs"
							disabled={props.saving || !selected || isFixedRole()}
							onClick={() => void save()}
						>
							<Save size={14} />
							保存权限
						</Button>
					}
				>
					{errorAlert}
					{permissionBody}
				</ManageSection>
			</div>
		);
	}

	return (
		<div className="min-w-0">
			<div className="grid min-w-0 gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
				<div className="flex flex-col gap-1">
					{roleList}
					<div className="mt-3 flex gap-2">
						<Input
							className="bg-card flex-1"
							placeholder="新角色名"
							value={newRoleName}
							onChange={(e) => setNewRoleName(e.currentTarget.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") createRole();
							}}
						/>
						<Button
							type="button"
							disabled={!newRoleName.trim() || props.saving}
							onClick={createRole}
						>
							<Plus size={14} />
							创建
						</Button>
					</div>
				</div>
				<div className="min-w-0">
					{errorAlert}
					{!selected ? (
						permissionBody
					) : (
						<>
							<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
								<h3 className="font-semibold">{selected}</h3>
								<Button
									type="button"
									disabled={props.saving || isFixedRole()}
									onClick={() => void save()}
								>
									<Save size={14} />
									保存权限
								</Button>
							</div>
							{permissionBody}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
