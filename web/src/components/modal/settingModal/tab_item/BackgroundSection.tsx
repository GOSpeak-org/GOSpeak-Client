import { Slider } from "@gospeak/components";
import { ImagePlus } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import {
	activePreset,
	backgroundPresets,
	backgroundStore,
	useBackgroundStore,
} from "@/stores/backgroundStore";
import { Field, Section } from "./shared";

export default function BackgroundSection() {
	const hasImage = useBackgroundStore((s) => s.hasImage);
	const glass = useBackgroundStore((s) => s.glass);
	const previewUrl = useBackgroundStore((s) => s.activeUrl);
	const available = useBackgroundStore((s) => s.available);
	const inputRef = useRef<HTMLInputElement>(null);
	const controlsDisabled = !hasImage || !available;
	const selectedPreset = activePreset(glass);

	const pickFile = () => inputRef.current?.click();

	const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (file) void backgroundStore.setImage(file);
	};

	return (
		<Section title="背景图">
			<p className="text-faint-foreground -mt-1 text-xs leading-relaxed">
				上传一张图片作为全局背景，深色与浅色模式共用。图片仅保存在本设备浏览器中。
			</p>
			{!available ? (
				<p className="text-faint-foreground text-xs">
					当前环境不支持存储背景图，功能已停用。
				</p>
			) : hasImage && previewUrl ? (
				<div className="border-border relative w-full overflow-hidden rounded-lg border">
					<img
						src={previewUrl}
						alt="背景图预览"
						className="aspect-video w-full object-cover"
					/>
					<div className="absolute right-2 bottom-2 flex gap-2">
						<button
							type="button"
							className="bg-neutral text-neutral-foreground hover:bg-neutral/85 rounded-pill px-3 py-1.5 text-xs"
							onClick={pickFile}
						>
							更换
						</button>
						<button
							type="button"
							className="bg-neutral text-neutral-foreground hover:bg-neutral/85 rounded-pill px-3 py-1.5 text-xs"
							onClick={() => void backgroundStore.removeImage()}
						>
							删除
						</button>
					</div>
				</div>
			) : (
				<button
					type="button"
					onClick={pickFile}
					className="border-border bg-card/40 hover:border-foreground/25 hover:bg-muted/40 text-faint-foreground flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-8 transition-colors"
				>
					<ImagePlus size={20} />
					<span className="text-xs">上传背景图</span>
				</button>
			)}
			<div className="mt-2 flex flex-col gap-2">
				<div
					className={`flex items-center gap-3 ${controlsDisabled ? "pointer-events-none opacity-45" : ""}`}
				>
					<span className="text-faint-foreground text-xs">快捷预设</span>
					<div className="bg-muted inline-flex gap-1 rounded-pill p-1">
						{backgroundPresets.map((option) => (
							<button
								key={option.value}
								type="button"
								disabled={controlsDisabled}
								onClick={() => backgroundStore.applyPreset(option.value)}
								className={`rounded-pill px-4 py-1 text-xs transition-colors ${
									selectedPreset === option.value
										? "bg-neutral text-neutral-foreground"
										: "text-muted-foreground hover:bg-card/50"
								}`}
							>
								{option.label}
							</button>
						))}
					</div>
					{selectedPreset === "custom" ? (
						<span className="text-faint-foreground text-2xs">自定义</span>
					) : null}
				</div>
				<Field label={`玻璃强度 · ${glass.strength}%`}>
					<Slider
						value={[glass.strength]}
						max={100}
						step={1}
						disabled={controlsDisabled}
						onValueChange={(value) =>
							backgroundStore.setGlass({ strength: value[0] ?? 0 })
						}
						aria-label="玻璃强度"
					/>
				</Field>
				<Field label={`不透明度 · ${glass.opacity}%`}>
					<Slider
						value={[glass.opacity]}
						max={100}
						step={1}
						disabled={controlsDisabled}
						onValueChange={(value) =>
							backgroundStore.setGlass({ opacity: value[0] ?? 0 })
						}
						aria-label="不透明度"
					/>
				</Field>
			</div>
			<input
				ref={inputRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={onFileChange}
			/>
		</Section>
	);
}
