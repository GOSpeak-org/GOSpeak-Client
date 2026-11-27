import type { SFUProvider } from "@gospeak/sfu-client/types";
import type { SFUConfigSource, UpdateSFUConfigParams } from "@/api/sfu";
import PasswordInput from "@/components/common/passwordInput";
import { AlertTriangle } from "lucide-react";
import type { SecretFlags } from "./constants";
import type { FieldErrors } from "./validation";

type ConfigSources = Record<
	"livekit_host" | "livekit_key" | "livekit_secret",
	SFUConfigSource
>;

export interface ProviderConfigFormProps {
	provider: SFUProvider;
	form: UpdateSFUConfigParams;
	errors: FieldErrors;
	secretFlags: SecretFlags;
	sources?: ConfigSources;
	saving: boolean;
	updateField: <K extends keyof UpdateSFUConfigParams>(
		key: K,
		value: UpdateSFUConfigParams[K],
	) => void;
}

const inputClass =
	"border-input bg-card text-foreground focus-visible:ring-ring placeholder:text-faint-foreground flex h-9 w-full rounded-sm border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50";
const inputErrorClass =
	"border-input bg-card text-destructive focus-visible:ring-destructive placeholder:text-faint-foreground flex h-9 w-full rounded-sm border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50";

function FormField({
	label,
	error,
	overridden,
	children,
}: {
	label: string;
	error?: string;
	overridden?: boolean;
	children: React.ReactNode;
}) {
	return (
		<label className="block">
			<span className="mb-1 flex flex-wrap items-center gap-2 text-sm">
				{label}
				{overridden && (
					<span className="border-warning/40 bg-warning/10 text-warning inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-normal">
						<AlertTriangle size={12} />
						环境变量覆盖，修改不生效
					</span>
				)}
			</span>
			{children}
			{error && <p className="text-destructive mt-1 text-xs">{error}</p>}
		</label>
	);
}

export default function ProviderConfigForm({
	provider,
	form,
	errors,
	secretFlags,
	sources,
	saving,
	updateField,
}: ProviderConfigFormProps) {
	const cls = (err?: string) => (err ? inputErrorClass : inputClass);

	if (provider === "livekit") {
		return (
			<div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
				<FormField
					label="Host（后端 LiveKit 地址）"
					error={errors.livekit_host}
					overridden={sources?.livekit_host === "env"}
				>
					<input
						type="text"
						className={cls(errors.livekit_host)}
						placeholder="ws://livekit:7880"
						value={form.livekit_host ?? ""}
						onChange={(event) =>
							updateField("livekit_host", event.currentTarget.value)
						}
						disabled={saving}
					/>
				</FormField>
				<FormField
					label="API Key"
					error={errors.livekit_key}
					overridden={sources?.livekit_key === "env"}
				>
					<input
						type="text"
						className={cls(errors.livekit_key)}
						placeholder="API key"
						value={form.livekit_key ?? ""}
						onChange={(event) =>
							updateField("livekit_key", event.currentTarget.value)
						}
						disabled={saving}
					/>
				</FormField>
				<FormField
					label="API Secret"
					error={errors.livekit_secret}
					overridden={sources?.livekit_secret === "env"}
				>
					<PasswordInput
						native
						autoComplete="off"
						className={cls(errors.livekit_secret)}
						placeholder={
							secretFlags.livekit_secret_set ? "已配置，留空保留" : "API secret"
						}
						value={form.livekit_secret ?? ""}
						onChange={(event) =>
							updateField("livekit_secret", event.currentTarget.value)
						}
						disabled={saving}
					/>
				</FormField>
			</div>
		);
	}

	return null;
}
