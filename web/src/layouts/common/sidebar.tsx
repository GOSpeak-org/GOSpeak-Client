import { ScrollArea } from "@gospeak/components";
import {
	DndContext,
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import clsx from "clsx";
import { Home, MessageSquare, Plus, Settings, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import OptionSquare from "@/components/common/optionSquare";
import { LoadingRegion, SkeletonIconRail } from "@/components/common/Skeletons";
import DomainIcon from "@/components/domain/DomainIcon";
import DomainGroupTile from "@/components/domain/DomainGroupTile";
import DomainLayoutContextMenu from "@/components/domain/DomainLayoutContextMenu";
import { firstAccessibleManagePath } from "@/components/manage/manageNav";
import { getMyDomainsDetailed, type DomainDetail } from "@/api/domain";
import {
	domainLayoutStore,
	useDomainLayoutStore,
} from "@/stores/domainLayoutStore";
import { domainStore, useDomainStore } from "@/stores/domainStore";
import { hasManageAccess } from "@/utils/permissions";

interface SidebarProps {
	onOpenSettings?: () => void;
	settingsOpen?: boolean;
}

const iconProps = {
	size: 20,
} as const;

const GROUP_PREFIX = "top-group:";
const DOMAIN_PREFIX = "top-domain:";
const INNER_PREFIX = "grp:";

interface SortableState {
	isDragging: boolean;
	isOver: boolean;
}

function SortableTile({
	id,
	children,
	disableShift = false,
}: {
	id: string;
	children: (state: SortableState) => ReactNode;
	disableShift?: boolean;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
		isOver,
	} = useSortable({ id });
	const noShift = disableShift && !isDragging;
	const style = {
		transform:
			!noShift && transform
				? `translate3d(${transform.x}px, ${transform.y}px, 0)`
				: undefined,
		transition: noShift ? undefined : transition,
	};
	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			className={clsx(
				"shrink-0 touch-manipulation",
				isDragging && "bg-selected",
			)}
		>
			{children({ isDragging, isOver })}
		</div>
	);
}

export default function Sidebar({
	onOpenSettings,
	settingsOpen,
}: SidebarProps) {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const myDomainUUIDs = useDomainStore((s) => s.myDomainUUIDs);
	const currentDomainUUID = useDomainStore((s) => s.currentDomainUUID);
	const groups = useDomainLayoutStore((s) => s.groups);
	const items = useDomainLayoutStore((s) => s.items);
	const joinedKey = myDomainUUIDs.join(",");
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const draggingDomain =
		!!draggingId &&
		(draggingId.startsWith(DOMAIN_PREFIX) ||
			draggingId.startsWith(INNER_PREFIX));

	useEffect(() => {
		void domainStore.loadMyDomains().catch(() => {});
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: 成员列表变化时重新拉取个人布局
	useEffect(() => {
		void domainLayoutStore.load().catch(() => {});
	}, [joinedKey]);

	const { data: domains, isLoading } = useQuery({
		queryKey: ["my-domains-detailed", joinedKey],
		queryFn: async () => {
			const rows = await getMyDomainsDetailed();
			return rows.filter((row) =>
				useDomainStore.getState().myDomainUUIDs.includes(row.uuid),
			);
		},
	});

	const domainMap = useMemo(
		() => new Map((domains ?? []).map((domain) => [domain.uuid, domain])),
		[domains],
	);
	const displayItems = useMemo(() => {
		if (items.length > 0) return items;
		return (domains ?? []).map((domain, index) => ({
			domain_uuid: domain.uuid,
			group_uuid: null,
			sort_order: (domains?.length ?? 0) - 1 - index,
		}));
	}, [items, domains]);
	const itemOrder = useMemo(
		() =>
			new Map(displayItems.map((item) => [item.domain_uuid, item.sort_order])),
		[displayItems],
	);
	const groupedDomains = useMemo(() => {
		const result = new Map<string, DomainDetail[]>();
		for (const group of groups) result.set(group.uuid, []);
		for (const item of displayItems) {
			if (!item.group_uuid) continue;
			const domain = domainMap.get(item.domain_uuid);
			const list = result.get(item.group_uuid);
			if (domain && list) list.push(domain);
		}
		for (const list of result.values()) {
			list.sort(
				(a, b) => (itemOrder.get(a.uuid) ?? 0) - (itemOrder.get(b.uuid) ?? 0),
			);
		}
		return result;
	}, [groups, displayItems, domainMap, itemOrder]);
	const ungroupedDomains = useMemo(() => {
		return displayItems
			.filter((item) => !item.group_uuid && domainMap.has(item.domain_uuid))
			.sort((a, b) => a.sort_order - b.sort_order)
			.map((item) => domainMap.get(item.domain_uuid) as DomainDetail);
	}, [displayItems, domainMap]);

	const homeActive =
		pathname === "/" ||
		pathname.startsWith("/index") ||
		pathname.startsWith("/discover");
	const chatActive = pathname.startsWith("/chat");
	const manageActive = pathname.startsWith("/manage");
	const settingsActive = pathname === "/settings" || !!settingsOpen;

	const handleSelect = async (uuid: string) => {
		const previousUUID = useDomainStore.getState().currentDomainUUID;
		domainStore.setCurrentDomain(uuid);
		try {
			await navigate({
				to: "/domain/$domainUUID",
				params: { domainUUID: uuid },
			});
		} catch {
			domainStore.setCurrentDomain(previousUUID);
		}
	};

	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 700, tolerance: 8 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const groupCount = (groupUUID: string | null) =>
		displayItems.filter((item) => (item.group_uuid ?? null) === groupUUID)
			.length;

	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id) return;
		const activeId = String(active.id);
		const overId = String(over.id);
		const activeDomain = activeId.startsWith(DOMAIN_PREFIX)
			? activeId.slice(DOMAIN_PREFIX.length)
			: activeId.startsWith(INNER_PREFIX)
				? activeId.split(":")[2]
				: null;

		if (activeId.startsWith(GROUP_PREFIX)) {
			if (!overId.startsWith(GROUP_PREFIX)) return;
			const from = groups.findIndex((g) => GROUP_PREFIX + g.uuid === activeId);
			const to = groups.findIndex((g) => GROUP_PREFIX + g.uuid === overId);
			domainLayoutStore.reorderGroups(from, to);
			return;
		}

		if (activeDomain && overId.startsWith(GROUP_PREFIX)) {
			const groupUUID = overId.slice(GROUP_PREFIX.length);
			domainLayoutStore.moveDomain(
				activeDomain,
				groupUUID,
				groupCount(groupUUID),
			);
			return;
		}

		if (activeId.startsWith(DOMAIN_PREFIX)) {
			if (overId === "zone:ungrouped") {
				domainLayoutStore.moveDomain(
					activeDomain as string,
					null,
					groupCount(null),
				);
				return;
			}
			if (overId.startsWith(DOMAIN_PREFIX)) {
				const to = ungroupedDomains.findIndex(
					(d) => DOMAIN_PREFIX + d.uuid === overId,
				);
				domainLayoutStore.moveDomain(activeDomain as string, null, to);
			}
			return;
		}

		if (activeId.startsWith(INNER_PREFIX)) {
			if (overId === "zone:ungrouped") {
				domainLayoutStore.moveDomain(
					activeDomain as string,
					null,
					groupCount(null),
				);
				return;
			}
			if (!overId.startsWith(INNER_PREFIX)) return;
			const activeParts = activeId.split(":");
			const overParts = overId.split(":");
			if (activeParts[1] !== overParts[1]) return;
			const groupUUID = activeParts[1];
			const list = displayItems
				.filter((item) => item.group_uuid === groupUUID)
				.sort((a, b) => a.sort_order - b.sort_order);
			const from = list.findIndex(
				(item) => item.domain_uuid === activeParts[2],
			);
			const to = list.findIndex((item) => item.domain_uuid === overParts[2]);
			domainLayoutStore.reorderDomains(groupUUID, from, to);
		}
	};

	const ungroupedIndexOf = (uuid: string) =>
		ungroupedDomains.findIndex((d) => d.uuid === uuid);

	return (
		<div className="flex h-full min-h-0 w-16 flex-col select-none">
			<div
				className={`flex flex-col items-center gap-2 px-2 ${__GOSPEAK_DESKTOP__ ? "pt-2" : ""}`}
			>
				<OptionSquare
					label="首页"
					active={homeActive}
					onClick={() => navigate({ to: "/discover" })}
				>
					<Home {...iconProps} />
				</OptionSquare>
				<OptionSquare
					label="聊天"
					active={chatActive}
					onClick={() => navigate({ to: "/chat" })}
				>
					<MessageSquare {...iconProps} />
				</OptionSquare>
				{hasManageAccess() && (
					<OptionSquare
						label="管理"
						active={manageActive}
						onClick={() =>
							navigate({
								to: `/manage/${firstAccessibleManagePath() ?? "users"}`,
							})
						}
					>
						<ShieldCheck {...iconProps} />
					</OptionSquare>
				)}
				<OptionSquare
					label="设置"
					active={settingsActive}
					onClick={() => onOpenSettings?.()}
				>
					<Settings {...iconProps} />
				</OptionSquare>
				<div className="bg-border my-1 h-px w-full shrink-0" />
			</div>
			<ScrollArea
				className="min-h-0 flex-1"
				viewportClassName="flex flex-col px-2 pb-3 [&>div]:mt-auto"
				type="auto"
			>
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragStart={({ active }) => setDraggingId(String(active.id))}
					onDragCancel={() => setDraggingId(null)}
					onDragEnd={(event) => {
						setDraggingId(null);
						handleDragEnd(event);
					}}
				>
					<div className="flex flex-col items-center gap-2">
						<SortableContext
							items={[
								...groups.map((g) => GROUP_PREFIX + g.uuid),
								...ungroupedDomains.map((d) => DOMAIN_PREFIX + d.uuid),
							]}
							strategy={verticalListSortingStrategy}
						>
							{isLoading ? (
								<LoadingRegion label="正在加载域">
									<SkeletonIconRail count={Math.max(1, myDomainUUIDs.length)} />
								</LoadingRegion>
							) : (
								<>
									{groups.map((group, index) => (
										<SortableTile
											key={group.uuid}
											id={GROUP_PREFIX + group.uuid}
											disableShift={draggingDomain}
										>
											{({ isOver }) => (
												<DomainGroupTile
													highlighted={isOver}
													group={group}
													domains={groupedDomains.get(group.uuid) ?? []}
													groups={groups}
													activeDomainUUID={currentDomainUUID}
													canMoveUp={index > 0}
													canMoveDown={index < groups.length - 1}
													onRename={(name) =>
														domainLayoutStore.renameGroup(group.uuid, name)
													}
													onRecolor={(color) =>
														domainLayoutStore.recolorGroup(group.uuid, color)
													}
													onDelete={() =>
														domainLayoutStore.removeGroup(group.uuid)
													}
													onMoveUp={() =>
														domainLayoutStore.reorderGroups(index, index - 1)
													}
													onMoveDown={() =>
														domainLayoutStore.reorderGroups(index, index + 1)
													}
													onSelectDomain={(uuid) => void handleSelect(uuid)}
													onMoveTo={(domainUUID, groupUUID) =>
														domainLayoutStore.moveDomain(
															domainUUID,
															groupUUID,
															groupCount(groupUUID),
														)
													}
													onReorder={(from, to) =>
														domainLayoutStore.reorderDomains(
															group.uuid,
															from,
															to,
														)
													}
												/>
											)}
										</SortableTile>
									))}
									{ungroupedDomains.map((domain) => {
										const index = ungroupedIndexOf(domain.uuid);
										return (
											<SortableTile
												key={domain.uuid}
												id={DOMAIN_PREFIX + domain.uuid}
												disableShift={draggingDomain}
											>
												{() => (
													<DomainLayoutContextMenu
														label={domain.name}
														groups={groups}
														onMove={(groupUUID) =>
															domainLayoutStore.moveDomain(
																domain.uuid,
																groupUUID,
																groupCount(groupUUID),
															)
														}
														onMoveUp={() =>
															domainLayoutStore.reorderDomains(
																null,
																index,
																index - 1,
															)
														}
														onMoveDown={() =>
															domainLayoutStore.reorderDomains(
																null,
																index,
																index + 1,
															)
														}
													>
														<DomainIcon
															name={domain.name}
															iconUrl={domain.icon_url}
															active={currentDomainUUID === domain.uuid}
															onClick={() => void handleSelect(domain.uuid)}
															requiresDoubleClick
														/>
													</DomainLayoutContextMenu>
												)}
											</SortableTile>
										);
									})}
									<OptionSquare
										label="新建分组"
										onClick={() => domainLayoutStore.addGroup("新分组", "lime")}
									>
										<Plus {...iconProps} />
									</OptionSquare>
								</>
							)}
						</SortableContext>
					</div>
				</DndContext>
			</ScrollArea>
		</div>
	);
}
