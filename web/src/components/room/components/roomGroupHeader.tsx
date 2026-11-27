import { ChevronDown, ChevronRight } from "lucide-react";

export default function RoomGroupHeader({
	name,
	count,
	collapsed,
	onToggle,
}: {
	name: string;
	count: number;
	collapsed: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			aria-expanded={!collapsed}
			onClick={onToggle}
			className="text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center gap-1 px-1 py-1 text-left text-xs font-semibold"
		>
			{collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
			<span className="min-w-0 flex-1 truncate">{name}</span>
			<span className="text-muted-foreground text-xs">{count}</span>
		</button>
	);
}
