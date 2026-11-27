import type { EffectiveSFUConfig, SFUConfigSource } from "@/api/sfu";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

const SRC_LABEL: Record<SFUConfigSource, string> = {
	env: "环境变量",
	db: "数据库",
};

function SourceBadge({ source }: { source: SFUConfigSource | undefined }) {
	if (!source) return null;
	const env = source === "env";
	return (
		<span
			className={[
				"rounded-full border px-2 py-0.5 text-2xs",
				env
					? "border-warning/40 bg-warning/10 text-warning"
					: "border-border text-muted-foreground",
			].join(" ")}
		>
			{SRC_LABEL[source]}
		</span>
	);
}

function ValueRow({
	label,
	value,
	source,
	hint,
	mono,
}: {
	label: string;
	value: string;
	source?: SFUConfigSource;
	hint?: string;
	mono?: boolean;
}) {
	const overridden = source === "env";
	return (
		<div className="border-border bg-muted/40 rounded-lg border px-3 py-2.5">
			<div className="mb-1 flex flex-wrap items-center justify-between gap-2">
				<span className="text-foreground text-xs font-medium">{label}</span>
				<SourceBadge source={source} />
			</div>
			<div
				className={[
					"text-foreground break-all text-xs",
					mono ? "font-mono" : "",
				].join(" ")}
			>
				{value || <span className="text-faint-foreground">未配置</span>}
			</div>
			{overridden && (
				<p className="text-warning mt-1 flex items-center gap-1 text-2xs">
					<AlertTriangle size={12} className="shrink-0" />
					{hint ?? "由环境变量覆盖，页面修改不会影响运行"}
				</p>
			)}
		</div>
	);
}

export default function EffectiveConfigPanel({
	effective,
}: {
	effective: EffectiveSFUConfig | undefined;
}) {
	if (!effective) return null;

	const envKeys = Object.entries(effective.sources ?? {})
		.filter(([, source]) => source === "env")
		.map(([key]) => key);
	const hasOverride = envKeys.length > 0;

	return (
		<section className="border-border bg-card rounded-lg border p-4 shadow-sm md:p-5">
			<div className="mb-3 flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="text-sm font-semibold">实际生效配置</div>
					<p className="text-faint-foreground mt-0.5 text-xs">
						以下是服务当前真正使用的连接参数，与下方「可编辑草稿」区分
					</p>
				</div>
				{hasOverride && (
					<span className="border-warning/40 bg-warning/10 text-warning flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs">
						<AlertTriangle size={12} />
						{envKeys.length} 项由环境变量管理
					</span>
				)}
			</div>

			<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
				<ValueRow
					label="浏览器连接地址"
					value={effective.browser_server_url}
					mono
				/>
				<ValueRow
					label="后端 LiveKit 地址"
					value={effective.livekit_host}
					source={effective.sources?.livekit_host}
					hint="由 LIVEKIT_HOST 覆盖；页面 Host 草稿不生效"
					mono
				/>
				<ValueRow
					label="API Key"
					value={effective.livekit_key}
					source={effective.sources?.livekit_key}
					hint="由 LIVEKIT_KEY 覆盖；页面 API Key 草稿不生效"
					mono
				/>
				<ValueRow
					label="API Secret"
					value={effective.livekit_secret_set ? "已配置" : "未配置"}
					source={effective.sources?.livekit_secret}
					hint="由 LIVEKIT_SECRET 覆盖；页面 Secret 草稿不生效"
				/>
			</div>

			<div className="border-border bg-muted/40 text-muted-foreground mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-2xs">
				{hasOverride ? (
					<AlertTriangle size={14} className="text-warning mt-0.5 shrink-0" />
				) : (
					<CheckCircle2 size={14} className="mt-0.5 shrink-0" />
				)}
				<span>
					{hasOverride
						? `标注为「环境变量」的字段由服务端 LIVEKIT_* 变量提供，优先级高于数据库。要让页面修改生效，请先清空对应环境变量并重启服务。`
						: "当前没有环境变量覆盖，所有字段都来自数据库，下方表单的修改保存后立即生效。"}
				</span>
			</div>

			{effective.livekit_public_url && (
				<p className="text-faint-foreground mt-2 flex items-center gap-1 text-2xs">
					<Info size={12} className="shrink-0" />
					已显式设置 LIVEKIT_PUBLIC_URL，浏览器直接连接该地址，不经过同源
					/livekit 反代。
				</p>
			)}
		</section>
	);
}
