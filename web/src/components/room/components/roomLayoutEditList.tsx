import { Button } from "@gospeak/components";
import {
	DndContext,
	DragOverlay,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragStartEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import clsx from "clsx";
import { Fragment, useState } from "react";
import { GripVertical, Hash, Lock, Mic, Plus } from "lucide-react";
import type { RoomInfo } from "@/socket/types";

export type EditBlock = {
	uuid: string;
	name: string;
	rooms: RoomInfo[];
};

const UNGROUPED = "__ungrouped__";

type ActiveDrag =
	| { type: "room"; room: RoomInfo }
	| { type: "block"; block: EditBlock };

function AddGroupRow({ onAdd }: { onAdd: () => void }) {
	return (
		<button
			type="button"
			onClick={onAdd}
			aria-label="新建分组"
			className="border-border text-muted-foreground hover:bg-muted hover:text-foreground flex w-full items-center justify-center gap-1 rounded-sm border border-dashed px-2 py-1.5 text-xs font-medium transition-colors"
		>
			<Plus size={14} />
			新建分组
		</button>
	);
}

function RoomRowContent({ room }: { room: RoomInfo }) {
	return (
		<>
			<span className="flex min-w-0 flex-1 items-center gap-1">
				{room.type === "text" ? <Hash size={16} /> : <Mic size={16} />}
				<span className="min-w-0 flex-1 truncate text-left leading-none">
					{room.name}
				</span>
				{room.has_password && (
					<span className="text-faint-foreground shrink-0">
						<Lock size={14} />
					</span>
				)}
			</span>
			{room.type !== "text" && (
				<span className="text-muted-foreground shrink-0 text-xs">
					{room.count}/{room.limit}
				</span>
			)}
		</>
	);
}

function BlockRowContent({ block }: { block: EditBlock }) {
	return (
		<>
			<GripVertical size={12} />
			<span className="min-w-0 flex-1 truncate text-xs font-semibold">
				{block.name}
			</span>
			<span className="text-muted-foreground text-xs">
				{block.rooms.length}
			</span>
		</>
	);
}

function SortableBlock({
	block,
	children,
}: {
	block: EditBlock;
	children: React.ReactNode;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: `block:${block.uuid}` });
	return (
		<div
			ref={setNodeRef}
			style={{
				transform: transform
					? `translate3d(${transform.x}px, ${transform.y}px, 0)`
					: undefined,
				transition,
			}}
			className={clsx("flex flex-col", isDragging && "bg-selected")}
		>
			<div className="flex items-center gap-1 px-1 py-1">
				<button
					type="button"
					aria-label={`拖拽排序分组 ${block.name}`}
					className="text-faint-foreground hover:text-foreground cursor-grab"
					{...attributes}
					{...listeners}
				>
					<GripVertical size={12} />
				</button>
				<span className="text-muted-foreground min-w-0 flex-1 truncate text-xs font-semibold">
					{block.name}
				</span>
				<span className="text-faint-foreground text-2xs">
					{block.rooms.length}
				</span>
			</div>
			{children}
		</div>
	);
}

function SortableRoom({ room }: { room: RoomInfo }) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: `room:${room.uuid}` });
	return (
		<div
			ref={setNodeRef}
			style={{
				transform: transform
					? `translate3d(${transform.x}px, ${transform.y}px, 0)`
					: undefined,
				transition,
			}}
			className={clsx(
				"flex w-full min-w-0 items-center",
				isDragging && "bg-selected",
			)}
		>
			<div
				{...attributes}
				{...listeners}
				className="hover:bg-muted flex w-full min-w-0 cursor-grab touch-manipulation items-center justify-between gap-1 rounded-sm px-1.5 py-2 text-sm transition-colors active:cursor-grabbing"
			>
				<RoomRowContent room={room} />
			</div>
		</div>
	);
}

export default function RoomLayoutEditList({
	blocks,
	onChange,
	onSave,
	saving,
}: {
	blocks: EditBlock[];
	onChange: (blocks: EditBlock[]) => void;
	onSave: () => void;
	saving: boolean;
}) {
	const sensors = useSensors(useSensor(PointerSensor));
	const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);

	const nextGroupName = () => {
		const taken = new Set(blocks.map((b) => b.name));
		if (!taken.has("新分组")) return "新分组";
		let index = 2;
		while (taken.has(`新分组 ${index}`)) index += 1;
		return `新分组 ${index}`;
	};

	const addGroup = () => {
		const block: EditBlock = {
			uuid:
				typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
					? crypto.randomUUID()
					: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			name: nextGroupName(),
			rooms: [],
		};
		onChange([block, ...blocks]);
	};

	const handleDragStart = ({ active }: DragStartEvent) => {
		const id = String(active.id);
		if (id.startsWith("room:")) {
			const uuid = id.slice(5);
			for (const block of blocks) {
				const room = block.rooms.find((r) => r.uuid === uuid);
				if (room) {
					setActiveDrag({ type: "room", room });
					return;
				}
			}
		}
		if (id.startsWith("block:")) {
			const uuid = id.slice(6);
			const block = blocks.find((b) => b.uuid === uuid);
			if (block) setActiveDrag({ type: "block", block });
		}
	};

	const onDragEnd = (event: DragEndEvent) => {
		setActiveDrag(null);
		if (!event.over || event.active.id === event.over.id) return;
		const activeId = String(event.active.id);
		const overId = String(event.over.id);
		const next = blocks.map((b) => ({ ...b, rooms: [...b.rooms] }));
		const findRoomBlock = (uuid: string) =>
			next.findIndex((b) => b.rooms.some((r) => r.uuid === uuid));
		if (activeId.startsWith("block:") && overId.startsWith("block:")) {
			const from = next.findIndex((b) => `block:${b.uuid}` === activeId);
			const to = next.findIndex((b) => `block:${b.uuid}` === overId);
			if (from < 0 || to < 0) return;
			const [moved] = next.splice(from, 1);
			next.splice(to, 0, moved);
			onChange(next);
			return;
		}
		if (activeId.startsWith("room:") && overId.startsWith("room:")) {
			const roomUUID = activeId.slice(5);
			const overUUID = overId.slice(5);
			const from = findRoomBlock(roomUUID);
			const to = findRoomBlock(overUUID);
			if (from < 0 || to < 0) return;
			const idx = next[from].rooms.findIndex((r) => r.uuid === roomUUID);
			const [room] = next[from].rooms.splice(idx, 1);
			const at = next[to].rooms.findIndex((r) => r.uuid === overUUID);
			next[to].rooms.splice(at < 0 ? next[to].rooms.length : at, 0, room);
			onChange(next);
			return;
		}
		if (activeId.startsWith("room:") && overId.startsWith("block:")) {
			const roomUUID = activeId.slice(5);
			const from = findRoomBlock(roomUUID);
			const to = next.findIndex((b) => `block:${b.uuid}` === overId);
			if (from < 0 || to < 0 || from === to) return;
			const idx = next[from].rooms.findIndex((r) => r.uuid === roomUUID);
			const [room] = next[from].rooms.splice(idx, 1);
			next[to].rooms.push(room);
			onChange(next);
		}
	};

	return (
		<div className="flex flex-col gap-2">
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragStart={handleDragStart}
				onDragCancel={() => setActiveDrag(null)}
				onDragEnd={onDragEnd}
			>
				<SortableContext
					items={blocks.map((b) => `block:${b.uuid}`)}
					strategy={verticalListSortingStrategy}
				>
					<AddGroupRow onAdd={addGroup} />
					{blocks.map((block, index) => (
						<Fragment key={block.uuid}>
							{block.uuid === UNGROUPED && index > 0 && (
								<div className="bg-border my-1 h-px w-full shrink-0" />
							)}
							<SortableBlock block={block}>
								<SortableContext
									items={block.rooms.map((r) => `room:${r.uuid}`)}
									strategy={verticalListSortingStrategy}
								>
									{block.rooms.map((room) => (
										<SortableRoom key={room.uuid} room={room} />
									))}
								</SortableContext>
							</SortableBlock>
							{block.uuid === UNGROUPED && index < blocks.length - 1 && (
								<div className="bg-border my-1 h-px w-full shrink-0" />
							)}
						</Fragment>
					))}
				</SortableContext>
				<DragOverlay dropAnimation={null}>
					{activeDrag?.type === "room" ? (
						<div className="bg-popover text-popover-foreground border-border flex w-60 items-center justify-between gap-1 rounded-sm border px-1.5 py-2 text-sm shadow-xl">
							<RoomRowContent room={activeDrag.room} />
						</div>
					) : activeDrag?.type === "block" ? (
						<div className="bg-popover text-muted-foreground border-border flex w-60 items-center gap-1 rounded-sm border px-1 py-1 shadow-xl">
							<BlockRowContent block={activeDrag.block} />
						</div>
					) : null}
				</DragOverlay>
			</DndContext>
			<Button type="button" size="xs" disabled={saving} onClick={onSave}>
				保存布局
			</Button>
		</div>
	);
}
