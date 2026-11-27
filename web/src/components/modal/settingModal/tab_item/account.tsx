import { Button, toast } from "@gospeak/components";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Unlink } from "lucide-react";
import { useEffect, useState } from "react";
import { changePassword } from "@/api/auth";
import {
	getEnabledProviders,
	getOAuthBindURL,
	listLinkedAccounts,
	unlinkAccount,
} from "@/api/oauth";
import ConfirmModal from "@/components/common/ConfirmModal";
import PasswordInput from "@/components/common/passwordInput";
import ProviderIcon from "@/components/oauth/ProviderIcon";
import { Field, Page, Section } from "./shared";
import type { SettingTabConfig } from "./types";

/** 绑定回调的 postMessage 由 OAuth 落地页同源发出，收到后刷新已绑定列表。 */
function useBindMessage(onBound: () => void) {
	useEffect(() => {
		function handler(event: MessageEvent) {
			if (event.origin !== window.location.origin) return;
			const data = event.data as {
				type?: string;
				ok?: boolean;
				action?: string;
			} | null;
			if (data?.type === "gospeak-oauth" && data.ok && data.action === "bind") {
				onBound();
			}
		}
		window.addEventListener("message", handler);
		return () => window.removeEventListener("message", handler);
	}, [onBound]);
}

export function PasswordSection() {
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");

	async function submit() {
		setError("");
		if (!next) {
			setError("请输入新密码");
			return;
		}
		if (next !== confirm) {
			setError("两次输入的新密码不一致");
			return;
		}
		setSubmitting(true);
		try {
			await changePassword(current, next);
			toast.success("密码已修改");
			setCurrent("");
			setNext("");
			setConfirm("");
		} catch {
			// apiClient 已统一弹出错误
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Section title="修改密码" desc="改完请用新密码登录其他设备。">
			<form
				noValidate
				className="flex flex-col gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					void submit();
				}}
			>
				<Field label="当前密码">
					<PasswordInput
						autoComplete="current-password"
						value={current}
						placeholder="请输入当前密码"
						onChange={(e) => setCurrent(e.target.value)}
					/>
				</Field>
				<Field label="新密码">
					<PasswordInput
						value={next}
						placeholder="请输入新密码"
						onChange={(e) => setNext(e.target.value)}
					/>
				</Field>
				<Field label="确认新密码">
					<PasswordInput
						value={confirm}
						placeholder="请再次输入新密码"
						onChange={(e) => setConfirm(e.target.value)}
					/>
				</Field>
				{error ? <p className="text-destructive text-xs">{error}</p> : null}
				<Button
					type="submit"
					size="sm"
					className="self-start"
					disabled={submitting}
				>
					{submitting ? "提交中…" : "修改密码"}
				</Button>
			</form>
		</Section>
	);
}

export function OAuthBindingPanel() {
	const queryClient = useQueryClient();
	const [pendingUnlink, setPendingUnlink] = useState<string | null>(null);
	const [unlinking, setUnlinking] = useState(false);
	const [binding, setBinding] = useState<string | null>(null);

	const linked = useQuery({
		queryKey: ["oauth-linked-accounts"],
		queryFn: listLinkedAccounts,
	});
	const enabled = useQuery({
		queryKey: ["oauth-enabled-providers"],
		queryFn: getEnabledProviders,
	});

	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: ["oauth-linked-accounts"] });
	};
	useBindMessage(refresh);

	useEffect(() => {
		if (!binding) return;
		const timer = window.setTimeout(() => setBinding(null), 60_000);
		return () => window.clearTimeout(timer);
	}, [binding]);

	const linkedNames = new Set((linked.data ?? []).map((a) => a.provider));
	const available = (enabled.data ?? []).filter(
		(p) => !linkedNames.has(p.name),
	);

	function handleBind(provider: string) {
		setBinding(provider);
		const win = window.open(
			getOAuthBindURL(provider),
			"gospeak-oauth-bind",
			"popup,width=560,height=640",
		);
		if (!win) {
			setBinding(null);
			toast.error("请允许弹窗后重试");
		}
	}

	async function handleUnlink() {
		if (!pendingUnlink) return;
		setUnlinking(true);
		try {
			await unlinkAccount(pendingUnlink);
			toast.success("已解除绑定");
			refresh();
		} catch {
			// apiClient 已统一弹出错误
		} finally {
			setUnlinking(false);
			setPendingUnlink(null);
		}
	}

	return (
		<>
			<Section title="已绑定" desc="已关联的登录方式，解绑后该方式将无法登录。">
				{(linked.data ?? []).length === 0 ? (
					<p className="text-faint-foreground py-2 text-sm">
						尚未绑定任何第三方账号。
					</p>
				) : (
					<div className="flex flex-col gap-2">
						{(linked.data ?? []).map((account) => (
							<div
								key={account.provider}
								className="border-border bg-card flex items-center gap-3 rounded-sm border px-3 py-2"
							>
								<ProviderIcon
									name={account.provider}
									iconUrl={account.icon_url}
									size={20}
								/>
								<span className="flex-1 text-sm">{account.display_name}</span>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setPendingUnlink(account.provider)}
									aria-label={`解绑 ${account.display_name}`}
								>
									<Unlink size={14} />
									解绑
								</Button>
							</div>
						))}
					</div>
				)}
			</Section>

			<Section title="可绑定" desc="点击后在弹窗中完成第三方授权。">
				{available.length === 0 ? (
					<p className="text-faint-foreground py-2 text-sm">
						暂无可绑定的登录方式。
					</p>
				) : (
					<div className="flex flex-wrap gap-2">
						{available.map((provider) => (
							<Button
								key={provider.name}
								variant="outline"
								size="sm"
								disabled={binding !== null}
								onClick={() => handleBind(provider.name)}
							>
								<ProviderIcon
									name={provider.name}
									iconUrl={provider.icon_url}
									size={16}
								/>
								{provider.display_name || provider.name}
								<ExternalLink size={12} />
							</Button>
						))}
					</div>
				)}
				{binding && (
					<p className="text-muted-foreground text-xs">
						正在等待 `${binding}` 授权完成…
					</p>
				)}
			</Section>

			<ConfirmModal
				open={!!pendingUnlink}
				title="解除第三方绑定"
				message={`确认解绑「${pendingUnlink}」？解绑后将无法再用该方式登录。`}
				confirmText="解绑"
				loading={unlinking}
				onClose={() => setPendingUnlink(null)}
				onConfirm={() => void handleUnlink()}
			/>
		</>
	);
}

export function AccountTab() {
	return (
		<Page title="账号" desc="修改登录密码，关联或解除第三方登录账号。">
			<PasswordSection />
			<OAuthBindingPanel />
		</Page>
	);
}

const config: SettingTabConfig = {
	id: "account",
	label: "账号",
	icon: "link",
	component: AccountTab,
};

export default config;
