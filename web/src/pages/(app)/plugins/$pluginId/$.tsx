import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import apiClient from "@/api/apiClient";
import { useThemeStore } from "@/stores/themeStore";

interface PluginPageInfo {
	plugin_id: string;
	route_path: string;
	mode: string;
	entry_url?: string;
}

const ALLOWED_MESSAGE_TYPES = new Set([
	"gospeak:ready",
	"gospeak:theme-request",
	"gospeak:browser-call",
	"gospeak:browser-refresh",
]);

const SANDBOX = "allow-scripts allow-forms allow-popups";

export const Route = createFileRoute("/(app)/plugins/$pluginId/$")({
	component: PluginPageHost,
	staticData: { title: "插件页面" },
});

function isTrustedMessage(
	event: MessageEvent,
	iframe: HTMLIFrameElement | null,
): boolean {
	if (!iframe || event.source !== iframe.contentWindow) return false;
	if (event.origin !== window.location.origin) return false;
	if (!event.data || typeof event.data !== "object") return false;
	return (
		typeof event.data.type === "string" &&
		ALLOWED_MESSAGE_TYPES.has(event.data.type)
	);
}

function PluginPageHost() {
	const { pluginId, _splat } = Route.useParams();
	const [pages, setPages] = useState<PluginPageInfo[] | null>(null);
	const [loadError, setLoadError] = useState("");
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const theme = useThemeStore((state) => state.theme);
	const isDark = useThemeStore((state) => state.isDark);

	useEffect(() => {
		let cancelled = false;
		setPages(null);
		setLoadError("");
		void (async () => {
			try {
				const data = await apiClient.get<PluginPageInfo[]>({
					url: `/api/v1/plugin/pages/${encodeURIComponent(pluginId)}`,
					silentError: true,
				});
				if (!cancelled) setPages(Array.isArray(data) ? data : []);
			} catch {
				if (!cancelled) {
					setPages([]);
					setLoadError("插件页面不可用或尚未被管理员确认");
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [pluginId]);

	const splatPath = useMemo(() => (_splat ?? "").replace(/^\/+/, ""), [_splat]);
	const page = useMemo(() => {
		if (!pages) return null;
		return pages.find((entry) => entry.plugin_id === pluginId) ?? null;
	}, [pages, pluginId]);

	const sendTheme = useCallback(() => {
		iframeRef.current?.contentWindow?.postMessage(
			{ type: "gospeak:theme", theme, isDark },
			window.location.origin,
		);
	}, [theme, isDark]);

	useEffect(() => {
		sendTheme();
	}, [sendTheme]);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (!isTrustedMessage(event, iframeRef.current)) return;
			const payload = event.data as {
				type: string;
				request_id?: string;
				payload?: unknown;
			};
			if (payload.type === "gospeak:theme-request") {
				sendTheme();
				return;
			}
			const endpoint =
				payload.type === "gospeak:browser-refresh" ? "refresh" : "call";
			const routePath = `/plugins/${pluginId}/${splatPath}`;
			void apiClient
				.post({
					url: `/api/v1/plugin/browser/${endpoint}`,
					data: {
						plugin_id: pluginId,
						route_path: routePath,
						kind: endpoint,
						payload: payload.payload ?? {},
					},
					silentError: true,
				})
				.then((result) => {
					iframeRef.current?.contentWindow?.postMessage(
						{
							type: "gospeak:browser-result",
							request_id: payload.request_id,
							data: result,
						},
						window.location.origin,
					);
				})
				.catch(() => {
					iframeRef.current?.contentWindow?.postMessage(
						{
							type: "gospeak:browser-result",
							request_id: payload.request_id,
							error: "failed",
						},
						window.location.origin,
					);
				});
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [pluginId, sendTheme, splatPath]);

	if (pages === null)
		return (
			<div className="p-4 text-sm text-muted-foreground">正在加载插件页面…</div>
		);
	if (!page)
		return (
			<div className="p-4 text-sm text-destructive">
				{loadError || "插件页面未确认"}
			</div>
		);
	if (page.plugin_id !== pluginId)
		return (
			<div className="p-4 text-sm text-destructive">插件页面标识不匹配</div>
		);

	const src = page.entry_url?.startsWith("/")
		? page.entry_url
		: `/plugins/${encodeURIComponent(pluginId)}/${splatPath}`;
	return (
		<div className="h-full w-full min-h-0 min-w-0">
			<iframe
				ref={iframeRef}
				title={`插件页面：${pluginId}`}
				src={src}
				sandbox={SANDBOX}
				referrerPolicy="no-referrer"
				className="h-full w-full border-0"
				onLoad={sendTheme}
			/>
		</div>
	);
}
