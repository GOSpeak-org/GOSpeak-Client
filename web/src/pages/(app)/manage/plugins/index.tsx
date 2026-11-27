import { Button, Input, toast } from "@gospeak/components";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PlugZap, RefreshCcw } from "lucide-react";
import { useState } from "react";
import apiClient from "@/api/apiClient";
import {
	ManageHeader,
	ManageLoading,
	ManagePage,
	ManageSection,
	ManageTag,
	manageTableHeadClass,
	manageTableRowClass,
} from "@/components/manage/ManageShell";
import { denyAccess } from "@/utils/accessDenied";
import { hasPermission } from "@/utils/permissions";
import { toastActionError } from "@/utils/toast";

export const Route = createFileRoute("/(app)/manage/plugins/")({
	beforeLoad: () => {
		if (!hasPermission("role:manage")) {
			denyAccess();
		}
	},
	component: PluginsPage,
	staticData: { title: "插件" },
});

interface PluginItem {
	plugin_id: string;
	name?: string;
	source: string;
	version: string;
	enabled: boolean;
	route_path: string;
}

interface RuntimeVersion {
	kind: string;
	version: string;
	active: boolean;
}

interface InstallResult {
	installed?: boolean;
	unsupported?: boolean;
}

interface UseResult {
	ok?: boolean;
	unsupported?: boolean;
}

type RuntimeKind = "node" | "python";

const pluginList = () =>
	apiClient.get<{ items: PluginItem[] }>({ url: "/api/v1/plugin/list" });
const runtimeList = (kind: RuntimeKind) =>
	apiClient.get<{ items: RuntimeVersion[] }>({
		url: "/api/v1/plugin/runtime/list",
		params: { kind },
	});

function PluginsPage() {
	const queryClient = useQueryClient();
	const [tab, setTab] = useState<RuntimeKind>("node");
	const [source, setSource] = useState("");
	const [ref, setRef] = useState("");
	const [installing, setInstalling] = useState(false);
	const [version, setVersion] = useState("");
	const [mirror, setMirror] = useState("");
	const [runtimeBusy, setRuntimeBusy] = useState(false);

	const { data, isLoading, error } = useQuery({
		queryKey: ["manage-plugins"],
		queryFn: pluginList,
	});
	const { data: runtimes, isLoading: runtimesLoading } = useQuery({
		queryKey: ["manage-plugin-runtimes", tab],
		queryFn: () => runtimeList(tab),
	});

	const items = data?.items ?? [];
	const versions = runtimes?.items ?? [];

	const refresh = async () => {
		await queryClient.invalidateQueries({ queryKey: ["manage-plugins"] });
		await queryClient.invalidateQueries({
			queryKey: ["manage-plugin-runtimes"],
		});
	};

	const install = async () => {
		if (!source.trim()) {
			toast.error("请填写插件来源（市场标识或 GitHub 仓库地址）");
			return;
		}
		setInstalling(true);
		try {
			await apiClient.post({
				url: "/api/v1/plugin/install",
				data: { source: source.trim(), ref: ref.trim() },
			});
			toast.success("插件已安装");
			setSource("");
			setRef("");
			await refresh();
		} catch (err) {
			toastActionError(err, "安装失败");
		} finally {
			setInstalling(false);
		}
	};

	const lifecycle = async (action: string, item: PluginItem) => {
		try {
			await apiClient.post({
				url: `/api/v1/plugin/${action}`,
				data: { plugin_id: item.plugin_id },
			});
			toast.success("操作成功");
			await refresh();
		} catch (err) {
			toastActionError(err, "操作失败");
		}
	};

	const installRuntime = async () => {
		if (!version.trim()) {
			toast.error("请选择或填写版本号");
			return;
		}
		setRuntimeBusy(true);
		try {
			const result = await apiClient.post<InstallResult>({
				url: "/api/v1/plugin/runtime/install",
				data: { kind: tab, version: version.trim(), mirror: mirror.trim() },
			});
			if (result?.unsupported) {
				toast.error("该运行时暂未开放");
				return;
			}
			toast.success("运行时版本已安装");
			await refresh();
		} catch (err) {
			toastActionError(err, "运行时安装失败");
		} finally {
			setRuntimeBusy(false);
		}
	};

	const switchRuntime = async (target: string) => {
		setRuntimeBusy(true);
		try {
			const result = await apiClient.post<UseResult>({
				url: "/api/v1/plugin/runtime/use",
				data: { kind: tab, version: target },
			});
			if (result?.unsupported) {
				toast.error("该运行时暂未开放");
				return;
			}
			toast.success("已切换运行时版本");
			await refresh();
		} catch (err) {
			toastActionError(err, "切换失败");
		} finally {
			setRuntimeBusy(false);
		}
	};

	return (
		<ManagePage>
			<ManageHeader
				icon={<PlugZap size={20} />}
				title="插件"
				description="安装、升级与热重载插件，并管理运行时版本"
				actions={
					<button
						type="button"
						className="hover:bg-muted flex size-9 cursor-pointer items-center justify-center rounded-sm transition-colors disabled:pointer-events-none disabled:opacity-50"
						onClick={() => void refresh()}
						disabled={installing || runtimeBusy}
						title="重新加载"
					>
						<RefreshCcw size={16} />
					</button>
				}
			/>

			<ManageSection title="安装插件">
				<div className="flex flex-col gap-3">
					<div className="flex flex-wrap items-center gap-2">
						<Input
							className="min-w-72 flex-1"
							placeholder="市场标识或仓库地址，例如 https://github.com/owner/repo"
							value={source}
							onChange={(e) => setSource(e.target.value)}
						/>
						<Input
							className="w-36"
							placeholder="版本/ref（可选）"
							value={ref}
							onChange={(e) => setRef(e.target.value)}
						/>
						<Button onClick={() => void install()} disabled={installing}>
							{installing ? "安装中..." : "安装"}
						</Button>
					</div>
					<p className="text-faint-foreground text-2xs">
						插件拉取后即被完全信任，拥有宿主能力；请只安装可信来源。
					</p>
				</div>
			</ManageSection>

			<ManageSection title="插件列表">
				{isLoading ? (
					<ManageLoading />
				) : error ? (
					<div className="text-destructive py-4 text-sm">
						插件列表加载失败，请刷新重试
					</div>
				) : items.length === 0 ? (
					<div className="text-faint-foreground py-8 text-center text-sm">
						暂无已安装插件
					</div>
				) : (
					<table className="w-full min-w-max text-sm">
						<thead className={manageTableHeadClass}>
							<tr>
								<th className="px-2 py-2 text-left">插件 ID</th>
								<th className="px-2 py-2 text-left">来源</th>
								<th className="px-2 py-2 text-left">版本</th>
								<th className="px-2 py-2 text-left">状态</th>
								<th className="px-2 py-2 text-right">操作</th>
							</tr>
						</thead>
						<tbody>
							{items.map((item) => (
								<tr key={item.plugin_id} className={manageTableRowClass}>
									<td className="px-2 py-2 font-medium">{item.plugin_id}</td>
									<td className="text-muted-foreground max-w-64 truncate px-2 py-2">
										{item.source}
									</td>
									<td className="px-2 py-2">{item.version || "-"}</td>
									<td className="px-2 py-2">
										<ManageTag>{item.enabled ? "已启用" : "已停用"}</ManageTag>
									</td>
									<td className="px-2 py-2 text-right whitespace-nowrap">
										<Button
											variant="ghost"
											size="xs"
											onClick={() => void lifecycle("upgrade", item)}
										>
											升级
										</Button>
										<Button
											variant="ghost"
											size="xs"
											onClick={() => void lifecycle("reload", item)}
										>
											重载
										</Button>
										<Button
											variant="ghost"
											size="xs"
											onClick={() =>
												void lifecycle(
													item.enabled ? "disable" : "enable",
													item,
												)
											}
										>
											{item.enabled ? "停用" : "启用"}
										</Button>
										<Button
											variant="ghost"
											size="xs"
											onClick={() => void lifecycle("uninstall", item)}
										>
											卸载
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</ManageSection>

			<ManageSection title="运行时版本">
				<div className="mb-3 flex items-center gap-1.5">
					{(["node", "python"] as const).map((kind) => (
						<button
							key={kind}
							type="button"
							onClick={() => setTab(kind)}
							className={
								tab === kind
									? "bg-primary text-primary-foreground rounded-sm px-3 py-1.5 text-xs"
									: "bg-muted text-muted-foreground rounded-sm px-3 py-1.5 text-xs"
							}
						>
							{kind === "node" ? "Node.js" : "Python"}
						</button>
					))}
				</div>
				{tab === "python" ? (
					<div className="border-border bg-muted/40 text-muted-foreground rounded-lg border px-4 py-6 text-center text-sm">
						Python 运行时暂未开放（仅预留入口）
					</div>
				) : (
					<div className="flex flex-col gap-3">
						<div className="flex flex-wrap items-center gap-2">
							<Input
								className="w-44"
								placeholder="版本号，如 v20.19.0"
								value={version}
								onChange={(e) => setVersion(e.target.value)}
							/>
							<Input
								className="min-w-56 flex-1"
								placeholder="镜像地址（可选）"
								value={mirror}
								onChange={(e) => setMirror(e.target.value)}
							/>
							<Button
								onClick={() => void installRuntime()}
								disabled={runtimeBusy}
							>
								安装版本
							</Button>
						</div>
						{runtimesLoading ? (
							<ManageLoading />
						) : versions.length === 0 ? (
							<div className="text-faint-foreground py-4 text-center text-sm">
								暂无已安装版本，请先下载后再切换
							</div>
						) : (
							<div className="border-border rounded-lg border">
								{versions.map((v) => (
									<div
										key={v.version}
										className="border-border flex items-center justify-between gap-2 border-b px-3 py-2 last:border-b-0"
									>
										<span className="text-sm">
											{v.kind} {v.version}
											{v.active && <ManageTag>当前使用</ManageTag>}
										</span>
										<Button
											variant="ghost"
											size="xs"
											disabled={runtimeBusy || v.active}
											onClick={() => void switchRuntime(v.version)}
										>
											切换
										</Button>
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</ManageSection>
		</ManagePage>
	);
}
