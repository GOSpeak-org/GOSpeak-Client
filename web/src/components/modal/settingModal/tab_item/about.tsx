import { Button } from "@gospeak/components";
import {
	createBrowser,
	createClientLog,
	createUpdater,
	inDesktop,
	type ReleaseInfo,
} from "@gospeak/desktop";
import { useEffect, useState } from "react";
import { currentEntries } from "@/utils/clientLog";
import { exportLogFile } from "@/utils/exportLog";
import { Page, Section } from "./shared";
import type { SettingTabConfig } from "./types";

type ExportState =
	| { status: "idle" }
	| { status: "working" }
	| { status: "done"; file: string }
	| { status: "error"; message: string };

type UpdateState =
	| "idle"
	| "checking"
	| "available"
	| "latest"
	| "noasset"
	| "downloading"
	| "done"
	| "error";

const REPO_URL = "https://github.com/GOSpeak-org/GOSpeak-Client";

/**
 * 关于 / 日志。
 *
 * 导出按钮在 Web 与桌面端共用同一个实现（exportLogFile），差异只在交付方式：
 * Web 走浏览器下载，桌面端由宿主接管下载并落到下载目录。
 */
function AboutForm() {
	const [state, setState] = useState<ExportState>({ status: "idle" });
	const [count, setCount] = useState(0);
	const [logsPath, setLogsPath] = useState("");
	const desktop = inDesktop();
	const updater = createUpdater();
	const browser = createBrowser();

	const [updateStatus, setUpdateStatus] = useState<UpdateState>("idle");
	const [release, setRelease] = useState<ReleaseInfo | null>(null);
	const [progress, setProgress] = useState(0);
	const [updateError, setUpdateError] = useState("");
	const [savedFile, setSavedFile] = useState("");

	useEffect(() => {
		setCount(currentEntries().length);
		if (!desktop) return;
		void createClientLog()
			.logsPath()
			.then(setLogsPath)
			.catch(() => {});
	}, [desktop]);

	// 下载进度由宿主通过 updater.progress 广播（0..1）。
	// updater 由 createUpdater() 返回模块级稳定对象，onProgress 身份不变。
	useEffect(() => {
		if (!desktop) return;
		return updater.onProgress(setProgress);
	}, [desktop, updater.onProgress]);

	const checkUpdate = async () => {
		setUpdateStatus("checking");
		setUpdateError("");
		setRelease(null);
		setSavedFile("");
		try {
			const info = await updater.checkRelease();
			setRelease(info);
			if (!info.available) {
				setUpdateStatus("latest");
			} else if (!info.assetName || !info.url) {
				setUpdateStatus("noasset");
			} else {
				setUpdateStatus("available");
			}
		} catch (e) {
			setUpdateStatus("error");
			setUpdateError(e instanceof Error ? e.message : String(e));
		}
	};

	const download = async () => {
		if (!release?.url) return;
		setUpdateStatus("downloading");
		setProgress(0);
		setUpdateError("");
		try {
			await updater.downloadRelease(release.url);
			setUpdateStatus("done");
			setSavedFile(release.assetName);
		} catch (e) {
			setUpdateStatus("error");
			setUpdateError(e instanceof Error ? e.message : String(e));
		}
	};

	const openRelease = async () => {
		try {
			await updater.openReleasePage();
		} catch {
			// 宿主不支持时静默，发布页链接仍在提示里
		}
	};

	const runExport = async () => {
		setState({ status: "working" });
		try {
			const file = await exportLogFile();
			setState({ status: "done", file });
			setCount(currentEntries().length);
		} catch (e) {
			setState({
				status: "error",
				message: e instanceof Error ? e.message : String(e),
			});
		}
	};

	const reveal = async () => {
		try {
			await createClientLog().revealLogs();
		} catch {
			// 宿主不支持时静默；路径本身仍显示在界面上
		}
	};

	return (
		<Page
			title="关于"
			desc="版本信息与客户端日志。遇到问题时导出日志文件附在反馈里，能显著加快定位。"
		>
			<Section title="版本">
				<div className="border-border bg-muted/40 flex flex-col gap-1 rounded-lg border p-4 text-sm">
					<div className="flex items-center justify-between gap-4">
						<span className="text-muted-foreground text-xs">客户端版本</span>
						<span className="font-medium">{__APP_VERSION__}</span>
					</div>
					<div className="flex items-center justify-between gap-4">
						<span className="text-muted-foreground text-xs">运行环境</span>
						<span className="font-medium">{desktop ? "桌面端" : "浏览器"}</span>
					</div>
					<div className="flex items-center justify-between gap-4">
						<span className="text-muted-foreground text-xs">项目地址</span>
						<a
							href={REPO_URL}
							target="_blank"
							rel="noreferrer"
							className="text-primary text-xs hover:underline"
							onClick={(e) => {
								if (!inDesktop()) return;
								e.preventDefault();
								void browser.openExternal(REPO_URL);
							}}
						>
							GitHub ↗
						</a>
					</div>
				</div>

				{desktop && (
					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap items-center gap-2">
							<Button
								size="sm"
								variant="outline"
								disabled={
									updateStatus === "checking" || updateStatus === "downloading"
								}
								onClick={() => void checkUpdate()}
							>
								{updateStatus === "checking" ? "正在检查…" : "检查更新"}
							</Button>
							{updateStatus === "available" && (
								<Button size="sm" onClick={() => void download()}>
									下载更新
								</Button>
							)}
							{(updateStatus === "error" || updateStatus === "noasset") && (
								<Button
									size="sm"
									variant="outline"
									onClick={() => void openRelease()}
								>
									前往发布页
								</Button>
							)}
						</div>

						{updateStatus === "latest" && (
							<p className="text-xs">已是最新版本</p>
						)}
						{updateStatus === "noasset" && (
							<p className="text-xs">
								发现新版本 {release?.version}
								，但当前平台暂无匹配安装包，请前往发布页手动下载。
							</p>
						)}
						{updateStatus === "error" && (
							<p className="text-destructive text-xs" title={updateError}>
								检查/下载失败：{updateError}
							</p>
						)}
						{updateStatus === "done" && (
							<p className="text-xs">已下载到 ~/Downloads/{savedFile}</p>
						)}

						{updateStatus === "available" && release && (
							<div className="border-border bg-muted/40 rounded-sm border px-3 py-2">
								<div className="text-sm">
									发现新版本
									<span className="ml-2 font-medium">{release.version}</span>
								</div>
								{release.notes ? (
									<div className="text-muted-foreground mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs">
										{release.notes}
									</div>
								) : null}
							</div>
						)}

						{updateStatus === "downloading" && (
							<>
								<div className="bg-border h-1.5 w-full overflow-hidden rounded-sm">
									<div
										className="bg-primary h-full transition-[width]"
										style={{ width: `${Math.round(progress * 100)}%` }}
									/>
								</div>
								<p className="text-muted-foreground text-xs">
									正在下载 {release?.assetName}… {Math.round(progress * 100)}%
								</p>
							</>
						)}
					</div>
				)}
			</Section>

			<Section
				title="客户端日志"
				desc="记录前端错误与宿主日志（各保留最近若干条，7 天后自动过期）。导出为纯文本文件。"
			>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						onClick={() => void runExport()}
						disabled={state.status === "working"}
					>
						{state.status === "working" ? "正在导出…" : "导出日志"}
					</Button>
					{desktop && (
						<Button size="sm" variant="outline" onClick={() => void reveal()}>
							打开日志文件夹
						</Button>
					)}
				</div>

				{state.status === "done" && (
					<p className="text-xs">
						{desktop
							? `已开始下载 ${state.file}，可在下载目录中找到。`
							: `已下载 ${state.file}。`}
					</p>
				)}
				{state.status === "error" && (
					<p className="text-destructive text-xs" title={state.message}>
						导出失败：{state.message}
					</p>
				)}

				<p className="text-muted-foreground text-xs">
					当前已记录 {count} 条{logsPath ? `；宿主日志目录：${logsPath}` : ""}
				</p>
			</Section>
		</Page>
	);
}

const aboutTab: SettingTabConfig = {
	id: "about",
	label: "关于",
	icon: "info",
	component: AboutForm,
};

export default aboutTab;
