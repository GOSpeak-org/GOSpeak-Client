import { ShieldCheck } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { denyAccess } from "@/utils/accessDenied";
import DomainPermissionPanel from "@/components/manage/DomainPermissionPanel";
import PlatformRolePanel from "@/components/manage/PlatformRolePanel";
import { ManageHeader, ManagePage } from "@/components/manage/ManageShell";
import { hasAnyPermission, hasPermission } from "@/utils/permissions";

export const Route = createFileRoute("/(app)/manage/roles/")({
	beforeLoad: () => {
		if (
			!hasAnyPermission(
				"role:read",
				"role:manage",
				"domain:manage",
				"domain:role:manage",
			)
		) {
			denyAccess();
		}
	},
	component: RolesPage,
	staticData: {
		title: "角色权限",
	},
});

type Scope = "platform" | "domain";

const tabClass = (active: boolean) =>
	`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
		active
			? "border-primary text-primary"
			: "text-muted-foreground hover:text-foreground border-transparent"
	}`;

function RolesPage() {
	const [scope, setScope] = useState<Scope>("platform");
	const canManagePlatform = hasPermission("role:manage");

	return (
		<ManagePage>
			<ManageHeader
				icon={<ShieldCheck size={20} />}
				title="角色权限"
				description="分别管理平台角色与域内角色；平台权限跨域生效，域内权限只属于所选域"
			/>

			<div className="border-border bg-card flex min-w-0 flex-col overflow-hidden rounded-xl border shadow-sm">
				<div className="border-border flex gap-1 border-b px-2 md:px-3">
					<button
						type="button"
						className={tabClass(scope === "platform")}
						onClick={() => setScope("platform")}
					>
						平台角色
					</button>
					<button
						type="button"
						className={tabClass(scope === "domain")}
						onClick={() => setScope("domain")}
					>
						域内角色
					</button>
				</div>
				<div className="min-w-0 p-3 md:p-4">
					{scope === "platform" ? (
						<PlatformRolePanel canManage={canManagePlatform} />
					) : (
						<DomainPermissionPanel />
					)}
				</div>
			</div>
		</ManagePage>
	);
}
