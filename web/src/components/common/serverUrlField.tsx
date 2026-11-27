import { Button, Input } from "@gospeak/components";
import {
	createClipboard,
	createServerConfig,
	inDesktop,
} from "@gospeak/desktop";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { parseInviteLink, type ParsedInviteLink } from "@/utils/domainInvite";
import { clearPendingInvite, setPendingInvite } from "@/utils/pendingInvite";
import { createServerConfig as createMobileServerConfig } from "@gospeak/mobile-capabilities";
import { setPublicBaseUrl } from "@/utils/publicBaseUrl";

/** 输入值与持久化值统一成规范形式：不带末尾斜杠（与能力层同一规则）。 */
const normalizeServerUrl = (raw: string) => raw.trim().replace(/\/+$/, "");

/**
 * 服务器地址输入框。桌面端保存后由宿主切换回环代理并刷新；移动端直接让
 * WebView 加载目标服务器（后端内嵌 Web UI 与 API/WS 同源，不受跨域限制）。
 */
export default function ServerUrlField({
	className,
	mobile = false,
	onBeforeSwitch,
}: {
	className?: string;
	mobile?: boolean;
	/** 移动端切换服务器前的会话清理回调；失败会中止切换。 */
	onBeforeSwitch?: () => void | Promise<void>;
}) {
	const navigate = useNavigate();
	const [config] = useState(() =>
		mobile ? createMobileServerConfig() : createServerConfig(),
	);
	const readMirror = () => normalizeServerUrl(config.getBaseUrlSync());
	const [value, setValue] = useState(readMirror);
	const [saved, setSaved] = useState(readMirror);
	const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
		"idle",
	);
	const [errorMessage, setErrorMessage] = useState("");
	const [invite, setInvite] = useState<ParsedInviteLink | null>(null);

	useEffect(() => {
		void config
			.getBaseUrl()
			.then((v) => {
				setValue(normalizeServerUrl(v));
				setSaved(normalizeServerUrl(v));
			})
			.catch(() => {});
		if (mobile) return;
		// 与「发现域」页同款：进入页面读一次剪贴板，识别到邀请链接就提示，
		// 但不自动切服务器（切服务器会清会话并重载，必须用户确认）。
		void (async () => {
			try {
				const text = await createClipboard().readText();
				const parsed = parseInviteLink(text);
				if (!parsed) return;
				setInvite(parsed);
				if (parsed.server) setValue(normalizeServerUrl(parsed.server));
			} catch {
				// 未授权读剪贴板：静默跳过，用户可手动粘贴。
			}
		})();
	}, [mobile, config]);

	const enterInvite = async (parsed: ParsedInviteLink) => {
		setStatus("saving");
		setInvite(null);
		const current = normalizeServerUrl(saved);
		const target = parsed.server ? normalizeServerUrl(parsed.server) : "";
		if (!target || target === current) {
			navigate({ to: "/invite/d/$code", params: { code: parsed.code } });
			return;
		}
		setPendingInvite(parsed.code);
		try {
			setPublicBaseUrl(target);
			await createServerConfig().setBaseUrl(target);
			navigate({ to: "/invite/d/$code", params: { code: parsed.code } });
			setTimeout(() => clearPendingInvite(), 2000);
		} catch {
			clearPendingInvite();
			setStatus("error");
		}
	};

	const persist = (viaBlur = false) => {
		const next = normalizeServerUrl(value);
		if (!next || status === "saving") return;
		if (mobile) {
			if (viaBlur) return;
			setStatus("saving");
			setErrorMessage("");
			// 先清会话：旧服务器的 HttpOnly Cookie 只能由旧服务器下发过期
			// Set-Cookie 清掉，否则切到新服务器后会被继续携带。
			// 原生插件切换反代目标后会 reload WebView，页面随即卸载。
			void (async () => {
				try {
					await onBeforeSwitch?.();
					setPublicBaseUrl(next);
					await config.setBaseUrl(next);
					setValue(next);
					setSaved(next);
					setStatus("success");
				} catch (error) {
					setErrorMessage(
						error instanceof Error ? error.message : "保存失败，请重试",
					);
					setStatus("error");
				}
			})();
			return;
		}
		// 有识别到的邀请时，焦点离开输入框不能顺手保存地址，否则会先切服务器
		// 并重载把邀请码弄丢。交给用户显式确认。
		if (invite) {
			if (viaBlur) return;
			void enterInvite(invite);
			return;
		}
		const parsed = parseInviteLink(next);
		if (parsed) {
			void enterInvite(parsed);
			return;
		}
		setStatus("saving");
		void config
			.setBaseUrl(next)
			.then(() => {
				// 回显规范值：浏览器端保存不重载页面，输入框必须立刻收敛到去掉
				// 末尾斜杠的形式，否则下一轮比较/分享链接会带着两种写法。
				setPublicBaseUrl(next);
				setValue(next);
				setSaved(next);
			})
			.catch(() => setStatus("error"));
	};

	return (
		<div className={className}>
			<label className="block">
				<span className="mb-1 block text-sm">服务器地址</span>
				<Input
					type="text"
					value={value}
					placeholder="https://your-server.com"
					autoComplete="off"
					spellCheck={false}
					onChange={(e) => {
						setValue(e.target.value);
						setInvite(null);
						setErrorMessage("");
					}}
					onBlur={() => {
						if (!mobile) persist(true);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							persist();
						}
					}}
				/>
			</label>

			{mobile && (
				<Button
					type="button"
					size="sm"
					className="mt-2"
					disabled={status === "saving" || status === "success"}
					onClick={() => persist()}
				>
					{status === "saving"
						? "正在连接…"
						: status === "success"
							? "已连接"
							: "连接服务器"}
				</Button>
			)}

			{!mobile && invite && (
				<div className="border-primary/40 bg-primary/5 mt-2 flex flex-col gap-2 rounded-sm border px-3 py-2">
					<p className="text-sm">
						检测到邀请链接
						<code className="text-primary mx-1 font-semibold">
							{invite.code}
						</code>
						{invite.server ? `（服务器 ${invite.server}）` : ""}
					</p>
					<div className="flex gap-2">
						<Button size="sm" onClick={() => void enterInvite(invite)}>
							连接并加入
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => {
								setInvite(null);
								setValue(saved);
							}}
						>
							忽略
						</Button>
					</div>
				</div>
			)}

			{status === "saving" ? (
				<p className="text-muted-foreground mt-1 text-xs">
					正在连接服务器并刷新…
				</p>
			) : status === "success" ? (
				<p className="text-primary mt-1 text-xs">
					服务器地址已更新，正在重新连接…
				</p>
			) : status === "error" ? (
				<p className="text-destructive mt-1 text-xs">
					{errorMessage || "保存失败，请重试。"}
				</p>
			) : (
				<p className="text-faint-foreground mt-1 text-xs">
					{mobile
						? "填写自托管服务器地址，保存后客户端会切换服务器并刷新。"
						: inDesktop()
							? "登录前填写要连接的 GOSpeak 服务器，也可以直接粘贴邀请链接；保存在本机，保存后自动连接并刷新。"
							: "登录前填写要连接的 GOSpeak 服务器。"}
				</p>
			)}
		</div>
	);
}
