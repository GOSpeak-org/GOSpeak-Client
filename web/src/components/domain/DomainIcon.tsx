import OptionSquare from "@/components/common/optionSquare";

interface DomainIconProps {
	name: string;
	iconUrl?: string;
	active?: boolean;
	onClick?: () => void;
	requiresDoubleClick?: boolean;
	/** 纯展示场景（如外层已有按钮）不渲染 button，避免嵌套交互元素 */
	interactive?: boolean;
	className?: string;
}

export default function DomainIcon({
	name,
	iconUrl,
	active,
	onClick,
	requiresDoubleClick,
	interactive = true,
	className,
}: DomainIconProps) {
	// 与 Avatar 保持一致：域头像只取名称的首个字符（按 Unicode 码点，兼容 emoji）
	const initial = (Array.from(name.trim())[0] ?? "?").toUpperCase();
	const visual = iconUrl ? (
		<img src={iconUrl} alt={name} className="size-12 rounded-xl object-cover" />
	) : (
		<span className="text-xl font-bold">{initial}</span>
	);
	if (!interactive) {
		return (
			<span className="bg-accent text-accent-foreground flex size-12 shrink-0 items-center justify-center rounded-xl">
				{visual}
			</span>
		);
	}
	return (
		<OptionSquare
			label={name}
			onClick={onClick}
			onDoubleClick={onClick}
			active={active}
			requiresDoubleClick={requiresDoubleClick}
			actionHint="双击进入"
			className={className}
		>
			{visual}
		</OptionSquare>
	);
}
