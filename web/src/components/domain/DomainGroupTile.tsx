import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	TOOLTIP_CONTENT_CLASS,
} from "@gospeak/components";
import { useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import clsx from "clsx";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import DomainIcon from "@/components/domain/DomainIcon";
import DomainGroupColorPicker from "@/components/domain/DomainGroupColor";
import DomainGroupIcon from "@/components/domain/DomainGroupIcon";
import DomainLayoutContextMenu from "@/components/domain/DomainLayoutContextMenu";
import type { DomainDetail } from "@/api/domain";
import type { DomainGroup } from "@/api/domainLayout";

type PanelMode = "contents" | "edit";

interface Point {
	x: number;
	y: number;
}

interface DomainGroupTileProps {
	group: DomainGroup;
	domains: DomainDetail[];
	groups: DomainGroup[];
	activeDomainUUID: string | null;
	canMoveUp: boolean;
	canMoveDown: boolean;
	highlighted?: boolean;
	onRename: (name: string) => void;
	onRecolor: (color: string) => void;
	onDelete: () => void;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onSelectDomain: (uuid: string) => void;
	onMoveTo: (domainUUID: string, groupUUID: string | null) => void;
	onReorder: (from: number, to: number) => void;
}

interface SortableDomainRowProps {
	id: string;
	domain: DomainDetail;
	groups: DomainGroup[];
	active: boolean;
	onSelect: (uuid: string) => void;
	onMoveTo: (domainUUID: string, groupUUID: string | null) => void;
	onMoveUp: () => void;
	onMoveDown: () => void;
}

function SortableDomainRow({
	id,
	domain,
	groups,
	active,
	onSelect,
	onMoveTo,
	onMoveUp,
	onMoveDown,
}: SortableDomainRowProps) {
	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useSortable({ id });
	const style = transform
		? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
		: undefined;
	return (
		<DomainLayoutContextMenu
			label={domain.name}
			groups={groups}
			onMove={(groupUUID) => onMoveTo(domain.uuid, groupUUID)}
			onMoveUp={onMoveUp}
			onMoveDown={onMoveDown}
		>
			<div
				ref={setNodeRef}
				style={style}
				className={clsx(
					"flex touch-manipulation items-center gap-1 rounded-lg p-1",
					isDragging && "bg-selected",
				)}
			>
				<button
					type="button"
					aria-label={`拖动 ${domain.name}`}
					{...attributes}
					{...listeners}
					className="text-muted-foreground hover:text-foreground flex size-5 shrink-0 cursor-grab items-center justify-center"
				>
					<GripVertical size={16} />
				</button>
				<button
					type="button"
					className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
					onClick={() => onSelect(domain.uuid)}
					title={domain.name}
				>
					<DomainIcon
						name={domain.name}
						iconUrl={domain.icon_url}
						interactive={false}
					/>
					<span className={clsx("truncate text-sm", active && "text-primary")}>
						{domain.name}
					</span>
				</button>
			</div>
		</DomainLayoutContextMenu>
	);
}

function UngroupedDropZone() {
	const { setNodeRef, isOver } = useDroppable({ id: "zone:ungrouped" });
	return (
		<div
			ref={setNodeRef}
			className={clsx(
				"rounded-lg border border-dashed p-2 text-center text-xs",
				isOver ? "bg-accent text-accent-foreground" : "text-faint-foreground",
			)}
		>
			拖到这里移出分组
		</div>
	);
}

export default function DomainGroupTile({
	group,
	domains,
	groups,
	activeDomainUUID,
	canMoveUp,
	canMoveDown,
	highlighted = false,
	onRename,
	onRecolor,
	onDelete,
	onMoveUp,
	onMoveDown,
	onSelectDomain,
	onMoveTo,
	onReorder,
}: DomainGroupTileProps) {
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<PanelMode>("contents");
	const [point, setPoint] = useState<Point>({ x: 0, y: 0 });
	const [draft, setDraft] = useState(group.name);
	const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pressOrigin = useRef<Point>({ x: 0, y: 0 });
	const groupButtonRef = useRef<HTMLButtonElement>(null);
	const [tooltip, setTooltip] = useState<Point | null>(null);
	useEffect(() => setDraft(group.name), [group.name]);

	const tooltipLabel = `${group.name} · ${domains.length} 个域`;
	const updateTooltipPosition = useCallback(() => {
		const el = groupButtonRef.current;
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

	const cancelPress = () => {
		if (pressTimer.current) {
			clearTimeout(pressTimer.current);
			pressTimer.current = null;
		}
	};

	useEffect(
		() => () => {
			if (pressTimer.current) clearTimeout(pressTimer.current);
		},
		[],
	);

	const commitName = () => {
		const trimmed = draft.trim();
		if (trimmed && trimmed !== group.name) onRename(trimmed);
		else setDraft(group.name);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) commitName();
			}}
		>
			<button
				ref={groupButtonRef}
				type="button"
				aria-label={`打开分组 ${group.name}`}
				onMouseEnter={updateTooltipPosition}
				onMouseLeave={() => setTooltip(null)}
				onFocus={updateTooltipPosition}
				onBlur={() => setTooltip(null)}
				onClick={(event) => {
					if (open && mode === "contents") {
						setOpen(false);
						return;
					}
					const rect = event.currentTarget.getBoundingClientRect();
					setPoint({ x: rect.right + 6, y: rect.top });
					setMode("contents");
					setOpen(true);
				}}
				onContextMenu={(event) => {
					event.preventDefault();
					event.stopPropagation();
					// 菜单顶部与分组按钮顶部对齐，而不是跟着鼠标落点浮动
					const rect = event.currentTarget.getBoundingClientRect();
					setPoint({ x: rect.right + 6, y: rect.top });
					setMode("edit");
					setOpen(true);
				}}
				onPointerDown={(event) => {
					if (event.pointerType !== "touch") return;
					pressOrigin.current = { x: event.clientX, y: event.clientY };
					cancelPress();
					const rect = event.currentTarget.getBoundingClientRect();
					pressTimer.current = setTimeout(() => {
						setPoint({ x: rect.right + 6, y: rect.top });
						setMode("edit");
						setOpen(true);
					}, 300);
				}}
				onPointerMove={(event) => {
					if (!pressTimer.current) return;
					const dx = Math.abs(event.clientX - pressOrigin.current.x);
					const dy = Math.abs(event.clientY - pressOrigin.current.y);
					if (dx > 8 || dy > 8) cancelPress();
				}}
				onPointerUp={cancelPress}
				onPointerCancel={cancelPress}
				onPointerLeave={cancelPress}
				className={clsx(
					"rounded-xl transition-[box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
					highlighted &&
						"ring-2 ring-primary ring-offset-2 ring-offset-background",
				)}
			>
				<DomainGroupIcon
					name={group.name}
					color={group.color}
					count={domains.length}
					domains={domains}
				/>
			</button>
			{tooltip && (
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
					{tooltipLabel}
				</div>
			)}
			<PopoverAnchor asChild>
				<div
					aria-hidden="true"
					style={{
						position: "fixed",
						left: point.x,
						top: point.y,
						width: 0,
						height: 0,
						pointerEvents: "none",
					}}
				/>
			</PopoverAnchor>
			<PopoverContent
				align="start"
				side="right"
				sideOffset={4}
				className="w-64 p-2"
			>
				{mode === "edit" ? (
					<div className="flex flex-col gap-2">
						<input
							aria-label="分组名称"
							maxLength={16}
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							onBlur={commitName}
							onKeyDown={(event) => {
								if (event.key === "Enter") event.currentTarget.blur();
							}}
							className="border-input bg-background w-full rounded-sm border px-2 py-1 text-sm"
						/>
						<DomainGroupColorPicker value={group.color} onChange={onRecolor} />
						<UngroupedDropZone />
						<div className="flex items-center justify-between">
							<div className="flex gap-1">
								<button
									type="button"
									disabled={!canMoveUp}
									aria-label="上移分组"
									onClick={onMoveUp}
									className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-md disabled:opacity-50"
								>
									<ArrowUp size={16} />
								</button>
								<button
									type="button"
									disabled={!canMoveDown}
									aria-label="下移分组"
									onClick={onMoveDown}
									className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-md disabled:opacity-50"
								>
									<ArrowDown size={16} />
								</button>
							</div>
							<button
								type="button"
								onClick={onDelete}
								className="text-destructive flex items-center gap-1 text-xs"
							>
								<Trash2 size={14} /> 删除分组
							</button>
						</div>
					</div>
				) : (
					<>
						{domains.length === 0 ? (
							<p className="text-faint-foreground px-1 text-xs">
								空分组：把域拖进来，或右键域选择「移到」。
							</p>
						) : (
							<SortableContext
								items={domains.map(
									(domain) => `grp:${group.uuid}:${domain.uuid}`,
								)}
								strategy={verticalListSortingStrategy}
							>
								{domains.map((domain, index) => (
									<SortableDomainRow
										key={domain.uuid}
										id={`grp:${group.uuid}:${domain.uuid}`}
										domain={domain}
										groups={groups}
										active={activeDomainUUID === domain.uuid}
										onSelect={onSelectDomain}
										onMoveTo={onMoveTo}
										onMoveUp={() => onReorder(index, index - 1)}
										onMoveDown={() => onReorder(index, index + 1)}
									/>
								))}
							</SortableContext>
						)}
						<UngroupedDropZone />
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}
