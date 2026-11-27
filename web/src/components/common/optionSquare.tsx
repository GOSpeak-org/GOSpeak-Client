import { Badge, TOOLTIP_CONTENT_CLASS } from "@gospeak/components";
import clsx from "clsx";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";

interface OptionSquareProps {
	className?: string;
	children: ReactNode;
	label?: string;
	onClick?: () => void | Promise<void>;
	active?: boolean;
	onDoubleClick?: () => void | Promise<void>;
	requiresDoubleClick?: boolean;
	actionHint?: string;
	/** 右上角未读徽章数量；0 或不传则不渲染 */
	badge?: number;
}

export default function OptionSquare({
	className,
	children,
	label,
	onClick,
	active,
	onDoubleClick,
	requiresDoubleClick,
	actionHint,
	badge,
}: OptionSquareProps) {
	const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);
	const [tooltipText, setTooltipText] = useState<string | undefined>(label);
	const buttonRef = useRef<HTMLButtonElement>(null);

	// 以按钮当前几何为锚点，tooltip 与按钮垂直居中；滚动/布局变化后重新计算，
	// 避免 tooltip 停在鼠标进入时的旧坐标上（侧栏滚动后与按钮错位）。
	const updateTooltipPosition = useCallback(() => {
		const el = buttonRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const x = rect.right + 8;
		const y = rect.top + rect.height / 2;
		setTooltip((prev) =>
			prev && prev.x === x && prev.y === y ? prev : { x, y },
		);
	}, []);

	const tooltipOpen = tooltip !== null;
	useEffect(() => {
		if (!tooltipOpen) return;
		window.addEventListener("scroll", updateTooltipPosition, true);
		window.addEventListener("resize", updateTooltipPosition);
		return () => {
			window.removeEventListener("scroll", updateTooltipPosition, true);
			window.removeEventListener("resize", updateTooltipPosition);
		};
	}, [tooltipOpen, updateTooltipPosition]);

	const showTooltip = (text?: string) => {
		setTooltipText(text ?? label ?? actionHint ?? "双击进入");
		updateTooltipPosition();
	};

	const hideTooltip = () => {
		setTooltip(null);
		setTooltipText(label);
	};

	return (
		<div className="relative">
			<button
				ref={buttonRef}
				type="button"
				onClick={() => {
					if (requiresDoubleClick) {
						showTooltip(actionHint ?? "双击进入");
						return;
					}
					void onClick?.();
				}}
				onDoubleClick={() => {
					if (requiresDoubleClick) void onDoubleClick?.();
				}}
				onKeyDown={(event) => {
					if (
						requiresDoubleClick &&
						(event.key === "Enter" || event.key === " ")
					) {
						event.preventDefault();
						void onDoubleClick?.();
					}
				}}
				onMouseEnter={() => showTooltip(label)}
				onMouseLeave={hideTooltip}
				onFocus={() => showTooltip(label)}
				onBlur={hideTooltip}
				aria-current={active ? "true" : undefined}
				aria-label={label}
				className={clsx(
					className,
					"bg-accent text-accent-foreground relative flex size-12 cursor-pointer touch-manipulation select-none items-center justify-center rounded-xl p-0",
					// 位移 / 明度 / 阴影同一条曲线，按下 75ms 收紧、松开 150ms 回弹
					"transition-[transform,filter,background-color,box-shadow,opacity] duration-150 ease-out",
					"hover:brightness-95",
					// 按下反馈：轻微缩小 + 适度压暗，够看出来又不发黑
					"active:scale-[0.96] active:brightness-90 active:duration-75",
					"focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
					"motion-reduce:transition-none motion-reduce:active:scale-100",
					active ? "shadow-sm" : "",
				)}
			>
				{children}
				{badge && badge > 0 ? (
					<span className="absolute -top-1 -right-1">
						<Badge count={badge} />
					</span>
				) : null}
				{active && (
					<span
						aria-hidden="true"
						className="bg-primary pointer-events-none absolute bottom-0.5 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full"
					/>
				)}
			</button>
			{label && tooltip && (
				<div
					aria-hidden="true"
					className={TOOLTIP_CONTENT_CLASS}
					style={{
						position: "fixed",
						zIndex: 999,
						left: `${tooltip.x}px`,
						top: `${tooltip.y}px`,
						transform: "translateY(-50%)",
					}}
				>
					{tooltipText}
				</div>
			)}
		</div>
	);
}
