import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@gospeak/components";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { type Domain, listPublicDomains } from "@/api/domain";
import {
	getJoinRequest,
	joinByCode,
	joinByDomain,
	previewInvite,
} from "@/api/inviteJoin";
import { joinTarget } from "@/utils/joinTarget";
import CreateDomainModal from "@/components/domain/CreateDomainModal";
import DomainInvitePreview from "@/components/domain/DomainInvitePreview";
import InviteCodeManager from "@/components/domain/InviteCodeManager";
import DiscoverDomainGrid from "@/components/discover/DiscoverDomainGrid";
import DiscoverHero from "@/components/discover/DiscoverHero";
import DiscoverMyDomains from "@/components/discover/DiscoverMyDomains";
import { ManagePage, ManageSection } from "@/components/manage/ManageShell";
import { domainStore, useDomainStore } from "@/stores/domainStore";
import {
	extractDomainInviteCode,
	shouldAutoOpenInvitePreview,
} from "@/utils/domainInvite";
import { localizedApiMessage } from "@/utils/errorMessages";
import { useKeepAliveActive } from "@/components/common/keepAliveOutlet";
import { createClipboard } from "@gospeak/desktop";

export const Route = createFileRoute("/(app)/discover")({
	component: DiscoverPage,
	staticData: {
		title: "发现域",
	},
});

const PAGE_SIZE = 12;
const clipboard = createClipboard();

export function DiscoverPage() {
	const isActive = useKeepAliveActive();
	const navigate = useNavigate();
	const _queryClient = useQueryClient();
	const [keyword, setKeyword] = useState("");
	const [heroInput, setHeroInput] = useState("");
	const [page, setPage] = useState(1);

	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewLoading, setPreviewLoading] = useState(false);
	const [previewDomain, setPreviewDomain] = useState<Domain | null>(null);
	const [previewCode, setPreviewCode] = useState("");
	const [previewDomainUUID, setPreviewDomainUUID] = useState("");
	const [pendingDomainUUIDs, setPendingDomainUUIDs] = useState<string[]>([]);
	const [previewError, setPreviewError] = useState("");
	const [joining, setJoining] = useState(false);

	const [createOpen, setCreateOpen] = useState(false);

	const {
		data: publicDomains,
		isLoading,
		isError,
		refetch,
	} = useQuery({
		queryKey: ["public-domains", keyword, page],
		queryFn: () => listPublicDomains(page, PAGE_SIZE, keyword || undefined),
		// keep-alive 下隐藏页仍保留 observer；只在页面可见时刷新，避免后台
		// 窗口聚焦触发的无意义请求。
		enabled: isActive,
	});

	const totalPages = Math.max(
		1,
		Math.ceil((publicDomains?.total ?? 0) / PAGE_SIZE),
	);

	const isJoined = (uuid: string) =>
		useDomainStore.getState().myDomainUUIDs.includes(uuid);

	const previewJoined = () => {
		const domain = previewDomain;
		return !!domain && isJoined(domain.uuid);
	};

	function openPublicPreview(domain: Domain) {
		if (previewLoading) return;
		setPreviewOpen(true);
		setPreviewLoading(false);
		setPreviewError("");
		setPreviewDomain(domain);
		setPreviewCode("");
		setPreviewDomainUUID(domain.uuid);
	}

	async function openPreview(code: string, opts?: { skipIfJoined?: boolean }) {
		if (previewLoading) return;
		const skipIfJoined = opts?.skipIfJoined ?? false;
		if (!skipIfJoined) setPreviewOpen(true);
		setPreviewLoading(true);
		setPreviewError("");
		setPreviewDomain(null);
		setPreviewCode(code);
		setPreviewDomainUUID("");
		try {
			const data = await previewInvite(code);
			if (
				skipIfJoined &&
				!shouldAutoOpenInvitePreview(
					data.domain.uuid,
					useDomainStore.getState().myDomainUUIDs,
				)
			) {
				return;
			}
			setPreviewDomain({
				id: 0,
				uuid: data.domain.uuid,
				name: data.domain.name,
				icon_url: data.domain.icon_url ?? "",
				description: data.domain.description ?? "",
				owner_uuid: "",
				is_public: true,
				require_join_approval: data.requires_approval,
				created_at: "",
			});
			setPreviewOpen(true);
		} catch (e) {
			// previewInvite 已设 skipErrorToast，这里是唯一的提示出口
			setPreviewError(localizedApiMessage(e, "邀请码无效"));
			setPreviewOpen(true);
		} finally {
			setPreviewLoading(false);
		}
	}

	function retryPreview() {
		if (!previewCode) {
			setPreviewOpen(false);
			return;
		}
		void openPreview(previewCode);
	}

	function handleHeroSubmit(e: React.FormEvent) {
		e.preventDefault();
		const code = extractDomainInviteCode(heroInput);
		if (code) {
			void openPreview(code);
			return;
		}
		setPage(1);
		setKeyword(heroInput.trim());
	}

	async function joinPreview() {
		const domain = previewDomain;
		const code = previewCode;
		const domainUUID = previewDomainUUID;
		if (!domain) return;
		if (joining) return;
		if (isJoined(domain.uuid)) {
			setPreviewOpen(false);
			navigate({
				to: "/domain/$domainUUID",
				params: { domainUUID: domain.uuid },
			});
			return;
		}
		const target = joinTarget(code, domainUUID);
		if (!target) {
			setPreviewError("未识别到邀请码或邀请链接");
			return;
		}
		setJoining(true);
		setPreviewError("");
		try {
			const result =
				"domain_uuid" in target
					? await joinByDomain(target.domain_uuid)
					: await joinByCode(target.code);
			if (result.status === "pending") {
				setPreviewError("已提交加入申请，等待管理员审核");
				return;
			}
			await domainStore.loadMyDomains().catch(() => {});
			domainStore.setCurrentDomain(result.domain.uuid);
			setPreviewOpen(false);
			navigate({
				to: "/domain/$domainUUID",
				params: { domainUUID: result.domain.uuid },
			});
		} catch (e) {
			setPreviewError(localizedApiMessage(e, "加入失败，请稍后重试"));
		} finally {
			setJoining(false);
		}
	}

	// 对当前页的公开域批量查询自己的申请状态，用于卡片三态渲染。
	useEffect(() => {
		if (!publicDomains?.domains.length) return;
		let cancelled = false;
		void (async () => {
			const results = await Promise.all(
				(publicDomains?.domains ?? []).map(async (domain) => {
					try {
						const view = await getJoinRequest(domain.uuid);
						return view.status === "pending" ? domain.uuid : "";
					} catch {
						return "";
					}
				}),
			);
			if (cancelled) return;
			setPendingDomainUUIDs(results.filter(Boolean));
		})();
		return () => {
			cancelled = true;
		};
	}, [publicDomains]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: 挂载时读取一次 URL 邀请码与剪贴板参数，后续加入动作由用户事件触发，不应随渲染重复执行
	useEffect(() => {
		void (async () => {
			try {
				// 先等已加入域列表就绪，否则 isJoined 会读到旧数据而误弹已加入域的确认框
				await domainStore.loadMyDomains();
				const text = await clipboard.readText();
				const code = extractDomainInviteCode(text);
				if (!code) return;
				setHeroInput(code);
				await openPreview(code, { skipIfJoined: true });
			} catch {
				// 浏览器未授权读取剪贴板、或域列表加载失败时静默处理，用户可手动输入。
			}
		})();
	}, []);

	return (
		<div className="min-h-full w-full flex-1 overflow-y-auto">
			<ManagePage className="mx-auto min-h-full w-full max-w-[1440px] !gap-3 p-3 md:p-4">
				<DiscoverHero
					value={heroInput}
					onChange={setHeroInput}
					onSubmit={handleHeroSubmit}
				/>

				<ManageSection
					title="公开域"
					description={`${publicDomains?.total ?? 0} 个公开域`}
					className="min-w-0"
					bodyClass="!p-3"
					actions={
						<button
							type="button"
							className="text-muted-foreground hover:bg-muted inline-flex h-7 cursor-pointer items-center gap-1 rounded-sm px-2 text-xs transition-colors"
							disabled={isLoading}
							onClick={() => void refetch()}
						>
							{isLoading ? (
								<Loader2 className="size-3.5 animate-spin" />
							) : (
								<RefreshCw size={14} />
							)}
							刷新
						</button>
					}
				>
					<DiscoverDomainGrid
						domains={publicDomains?.domains ?? []}
						loading={isLoading}
						hasError={isError}
						page={page}
						totalPages={totalPages}
						joinedUUIDs={useDomainStore.getState().myDomainUUIDs}
						pendingUUIDs={pendingDomainUUIDs}
						onOpen={openPublicPreview}
						onEnter={(domain) =>
							navigate({
								to: "/domain/$domainUUID",
								params: { domainUUID: domain.uuid },
							})
						}
						onPageChange={setPage}
						onRetry={() => void refetch()}
					/>
				</ManageSection>

				<div className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(400px,3fr)]">
					<ManageSection
						title="我的域"
						description="快捷进入已加入的语音域"
						padded={false}
					>
						<DiscoverMyDomains />
					</ManageSection>

					<ManageSection
						title="分享链接"
						description="为你的域创建并分享邀请码"
						bodyClass="overflow-x-auto"
					>
						<InviteCodeManager />
					</ManageSection>
				</div>
			</ManagePage>

			{previewOpen && (
				<DomainJoinPreviewModal
					previewDomain={previewDomain}
					previewLoading={previewLoading}
					previewError={previewError}
					previewJoined={previewJoined()}
					joining={joining}
					onConfirm={joinPreview}
					onCancel={() => setPreviewOpen(false)}
					onRetry={retryPreview}
				/>
			)}

			<CreateDomainModal
				open={createOpen}
				onClose={() => setCreateOpen(false)}
				onCreated={(domain) =>
					navigate({
						to: "/domain/$domainUUID",
						params: { domainUUID: domain.uuid },
					})
				}
			/>
		</div>
	);
}

function DomainJoinPreviewModal(props: {
	previewDomain: Domain | null;
	previewLoading: boolean;
	previewError: string;
	previewJoined: boolean;
	joining: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	onRetry: () => void;
}) {
	// 用 Radix Dialog 而不是手写遮罩：Esc 关闭、焦点陷阱、aria-labelledby 都是白拿的
	return (
		<Dialog open onOpenChange={(v) => !v && props.onCancel()}>
			<DialogContent className="max-w-md">
				<DialogTitle className="mb-1 text-lg font-bold">加入域</DialogTitle>
				<DomainInvitePreview
					domain={props.previewDomain}
					joined={props.previewJoined}
					loading={props.previewLoading}
					error={props.previewError}
					joining={props.joining}
					onConfirm={props.onConfirm}
					onCancel={props.onCancel}
					onRetry={props.onRetry}
				/>
			</DialogContent>
		</Dialog>
	);
}
