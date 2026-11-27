import clsx from "clsx";
import { Folder } from "lucide-react";
import { colorChip } from "@/utils/domainLayout";

interface GroupPreviewDomain {
	uuid?: string;
	name: string;
	icon_url?: string;
}

interface DomainGroupIconProps {
	name: string;
	color: string;
	count: number;
	active?: boolean;
	domains?: GroupPreviewDomain[];
}

/** 手机文件夹式四宫格：固定 2×2 四个格子，空位保留占位。 */
const GRID_SLOTS = 4;
const SLOT_KEYS = ["slot-0", "slot-1", "slot-2", "slot-3"] as const;

function initialOf(name: string): string {
	return (Array.from(name.trim())[0] ?? "?").toUpperCase();
}

export default function DomainGroupIcon({
	name,
	color,
	count,
	active,
	domains = [],
}: DomainGroupIconProps) {
	const label = `${name} · ${count} 个域`;
	const previews = domains.slice(0, GRID_SLOTS);
	return (
		<span
			role="img"
			aria-label={label}
			className={clsx(
				"relative flex size-12 shrink-0 items-center justify-center rounded-xl",
				colorChip(color),
				active && "shadow-sm",
			)}
		>
			{count === 0 ? (
				<Folder size={24} />
			) : (
				<span className="grid grid-cols-2 gap-0.5 p-1">
					{SLOT_KEYS.map((slotKey, index) => {
						const domain = previews[index];
						if (!domain) {
							return (
								<span
									key={slotKey}
									aria-hidden="true"
									className="bg-background/40 size-4 shrink-0 rounded-xs"
								/>
							);
						}
						return (
							<span
								key={domain.uuid ?? domain.name + domain.icon_url}
								className="bg-background text-foreground flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-xs text-2xs font-bold"
							>
								{domain.icon_url ? (
									<img
										src={domain.icon_url}
										alt=""
										className="size-4 rounded-xs object-cover"
									/>
								) : (
									initialOf(domain.name)
								)}
							</span>
						);
					})}
				</span>
			)}
			<span className="bg-neutral text-neutral-foreground absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-2xs">
				{count}
			</span>
			{active && (
				<span
					aria-hidden="true"
					className="bg-primary pointer-events-none absolute bottom-0.5 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full"
				/>
			)}
		</span>
	);
}
