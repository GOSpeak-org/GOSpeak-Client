import { Button, Input, toast } from "@gospeak/components";
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
import { GripVertical, Plus, Save } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import {
	type RoomLayoutBrief,
	type RoomLayoutSaveReq,
	type RoomLayoutView,
	saveRoomLayout,
} from "@/api/domain";
import { apiErrorMessage } from "@/utils/apiError";
import { toastActionError } from "@/utils/toast";

const UNGROUPED = "__ungrouped__";

type Block = {
	uuid: string;
	name: string;
	rooms: RoomLayoutBrief[];
};

type ActiveDrag =
	| { type: "room"; room: RoomLayoutBrief }
	| { type: "block"; block: Block };

function SortableHandle({ id }: { id: string }) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id });
	return (
		<button
			ref={setNodeRef}
			type="button"
			aria-label="拖拽排序"
			style={{
				transform: transform
					? `translate3d(${transform.x}px, ${transform.y}px, 0)`
					: undefined,
				transition,
			}}
			className={clsx(
				"text-muted-foreground hover:text-foreground cursor-grab px-1",
				isDragging && "bg-selected",
			)}
			{...attributes}
			{...listeners}
		>
			<GripVertical size={14} />
		</button>
	);
}

function SortableRoom({
	room,
	editable,
}: {
	room: RoomLayoutBrief;
	editable: boolean;
}) {
	const { setNodeRef, transform, transition, isDragging } = useSortable({
		id: `room:${room.uuid}`,
	});
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
				"border-border flex items-center gap-2 rounded-sm border px-2 py-1 text-xs",
				isDragging && "bg-selected",
			)}
		>
			{editable && <SortableHandle id={`room:${room.uuid}`} />}
			<span className="min-w-0 flex-1 truncate">{room.name}</span>
			<span className="text-faint-foreground font-mono text-2xs">
				{room.uuid}
			</span>
		</div>
	);
}

function findRoomBlock(blocks: Block[], roomUUID: string) {
	return blocks.findIndex((b) => b.rooms.some((r) => r.uuid === roomUUID));
}

export default function DomainRoomLayoutPanel({
	domainUUID,
	layout,
	onSaved,
}: {
	domainUUID: string;
	layout: RoomLayoutView;
	onSaved?: () => void;
}) {
	const editable = layout.can_manage;
	const [blocks, setBlocks] = useState<Block[]>([]);
	const [saving, setSaving] = useState(false);
	const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
	useEffect(() => {
		const next: Block[] = layout.groups.map((g) => ({
			uuid: g.uuid,
			name: g.name,
			rooms: g.rooms,
		}));
		next.splice(Math.min(layout.ungrouped_position, next.length), 0, {
			uuid: UNGROUPED,
			name: "未分组",
			rooms: layout.ungrouped,
		});
		setBlocks(next);
	}, [layout]);

	const sensors = useSensors(useSensor(PointerSensor));

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
			const block = blocks.find(
				(b) => (b.uuid || `new-${b.name}`) === uuid || b.uuid === uuid,
			);
			if (block) setActiveDrag({ type: "block", block });
		}
	};

	const onDragEnd = (event: DragEndEvent) => {
		setActiveDrag(null);
		if (!editable || !event.over || event.active.id === event.over.id) return;
		const activeId = String(event.active.id);
		const overId = String(event.over.id);
		setBlocks((prev) => {
			const next = prev.map((b) => ({ ...b, rooms: [...b.rooms] }));
			if (activeId.startsWith("block:") && overId.startsWith("block:")) {
				const from = next.findIndex((b) => `block:${b.uuid}` === activeId);
				const to = next.findIndex((b) => `block:${b.uuid}` === overId);
				if (from < 0 || to < 0) return prev;
				const [moved] = next.splice(from, 1);
				next.splice(to, 0, moved);
				return next;
			}
			if (activeId.startsWith("room:") && overId.startsWith("room:")) {
				const roomUUID = activeId.slice(5);
				const overUUID = overId.slice(5);
				const from = findRoomBlock(next, roomUUID);
				const to = findRoomBlock(next, overUUID);
				if (from < 0 || to < 0) return prev;
				const [room] = next[from].rooms.splice(
					next[from].rooms.findIndex((r) => r.uuid === roomUUID),
					1,
				);
				const at = next[to].rooms.findIndex((r) => r.uuid === overUUID);
				next[to].rooms.splice(at < 0 ? next[to].rooms.length : at, 0, room);
				return next;
			}
			if (activeId.startsWith("room:") && overId.startsWith("block:")) {
				const roomUUID = activeId.slice(5);
				const from = findRoomBlock(next, roomUUID);
				const to = next.findIndex((b) => `block:${b.uuid}` === overId);
				if (from < 0 || to < 0 || from === to) return prev;
				const idx = next[from].rooms.findIndex((r) => r.uuid === roomUUID);
				const [room] = next[from].rooms.splice(idx, 1);
				next[to].rooms.push(room);
				return next;
			}
			return prev;
		});
	};

	const nextGroupName = (list: Block[]) => {
		const taken = new Set(list.map((b) => b.name));
		if (!taken.has("新分组")) return "新分组";
		let index = 2;
		while (taken.has(`新分组 ${index}`)) index += 1;
		return `新分组 ${index}`;
	};

	const addGroup = () => {
		setBlocks((prev) => [
			{ uuid: "", name: nextGroupName(prev), rooms: [] },
			...prev,
		]);
	};

	const save = async () => {
		const ungrouped = blocks.find((b) => b.uuid === UNGROUPED);
		const groups = blocks
			.filter((b) => b.uuid !== UNGROUPED)
			.map((b, i) => ({
				uuid: b.uuid || undefined,
				name: b.name,
				sort_order: i,
				room_uuids: b.rooms.map((r) => r.uuid),
			}));
		const req: RoomLayoutSaveReq = {
			domain_uuid: domainUUID,
			groups,
			ungrouped_position: blocks.findIndex((b) => b.uuid === UNGROUPED),
			ungrouped_room_uuids: ungrouped?.rooms.map((r) => r.uuid) ?? [],
		};
		setSaving(true);
		try {
			await saveRoomLayout(req);
			toast.success("布局已保存");
			onSaved?.();
		} catch (error) {
			toastActionError(error, "保存布局失败");
			console.error(apiErrorMessage(error));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragStart={handleDragStart}
				onDragCancel={() => setActiveDrag(null)}
				onDragEnd={onDragEnd}
			>
				<SortableContext
					items={blocks.map((b) => `block:${b.uuid || `new-${b.name}`}`)}
					strategy={verticalListSortingStrategy}
				>
					{blocks.map((block, index) => (
						<Fragment key={block.uuid || `new-${index}`}>
							{block.uuid === UNGROUPED && index > 0 && (
								<div className="bg-border my-1 h-px w-full shrink-0" />
							)}
							<div className="border-border rounded-lg border p-2">
								<div className="mb-2 flex items-center gap-2">
									{editable && (
										<SortableHandle
											id={`block:${block.uuid || `new-${index}`}`}
										/>
									)}
									{editable && block.uuid !== UNGROUPED ? (
										<Input
											className="h-7 flex-1 px-2 text-xs"
											value={block.name}
											onChange={(e) =>
												setBlocks((prev) =>
													prev.map((b, i) =>
														i === index
															? { ...b, name: e.currentTarget.value }
															: b,
													),
												)
											}
										/>
									) : (
										<span className="flex-1 text-sm font-medium">
											{block.name}
										</span>
									)}
									<span className="text-faint-foreground text-2xs">
										{block.rooms.length} 个房间
									</span>
								</div>
								<SortableContext
									items={block.rooms.map((r) => `room:${r.uuid}`)}
									strategy={verticalListSortingStrategy}
								>
									<div className="flex flex-col gap-1">
										{block.rooms.map((room) => (
											<SortableRoom
												key={room.uuid}
												room={room}
												editable={editable}
											/>
										))}
										{block.rooms.length === 0 && (
											<div className="text-faint-foreground px-2 py-1 text-xs">
												暂无房间
											</div>
										)}
									</div>
								</SortableContext>
							</div>
							{block.uuid === UNGROUPED && index < blocks.length - 1 && (
								<div className="bg-border my-1 h-px w-full shrink-0" />
							)}
						</Fragment>
					))}
				</SortableContext>
				<DragOverlay dropAnimation={null}>
					{activeDrag?.type === "room" ? (
						<div className="bg-popover text-popover-foreground border-border flex items-center gap-2 rounded-sm border px-2 py-1 text-xs shadow-xl">
							<GripVertical size={14} className="text-muted-foreground" />
							<span className="min-w-0 flex-1 truncate">
								{activeDrag.room.name}
							</span>
							<span className="text-faint-foreground font-mono text-2xs">
								{activeDrag.room.uuid}
							</span>
						</div>
					) : activeDrag?.type === "block" ? (
						<div className="bg-popover text-muted-foreground border-border flex items-center gap-2 rounded-sm border px-2 py-1 text-xs shadow-xl">
							<GripVertical size={14} />
							<span className="min-w-0 flex-1 truncate font-semibold">
								{activeDrag.block.name}
							</span>
							<span className="text-faint-foreground text-2xs">
								{activeDrag.block.rooms.length} 个房间
							</span>
						</div>
					) : null}
				</DragOverlay>
			</DndContext>
			{editable && (
				<div className="flex items-center gap-2">
					<Button type="button" size="xs" variant="outline" onClick={addGroup}>
						<Plus size={14} />
						新增分组
					</Button>
					<Button
						type="button"
						size="xs"
						disabled={saving}
						onClick={() => void save()}
					>
						<Save size={14} />
						保存布局
					</Button>
				</div>
			)}
		</div>
	);
}
