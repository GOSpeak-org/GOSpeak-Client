import {
	type ContextMenuItemDescriptor,
	closeContextMenu,
	showContextMenu,
} from "@gospeak/components";
import type { ReactNode } from "react";
import type { DomainGroup } from "@/api/domainLayout";

interface DomainLayoutContextMenuProps {
	label: string;
	groups: DomainGroup[];
	onMove: (groupUUID: string | null) => void;
	onMoveUp: () => void;
	onMoveDown: () => void;
	children: ReactNode;
}

export default function DomainLayoutContextMenu({
	label,
	groups,
	onMove,
	onMoveUp,
	onMoveDown,
	children,
}: DomainLayoutContextMenuProps) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: 右键菜单容器；键盘用户走拖拽排序
		<div
			onContextMenu={(event) => {
				event.preventDefault();
				event.stopPropagation();
				const root = event.currentTarget as HTMLElement;
				const anchor =
					Array.from(root.querySelectorAll("button")).find(
						(btn) =>
							btn.getAttribute("aria-label") === label ||
							btn.getAttribute("title") === label,
					) ?? root;
				const rect = anchor.getBoundingClientRect();
				closeContextMenu();
				const items: ContextMenuItemDescriptor[] = [
					{
						key: "ungrouped",
						label: "移到未分组",
						onSelect: () => onMove(null),
					},
					...groups.map((group) => ({
						key: group.uuid,
						label: `移到「${group.name}」`,
						onSelect: () => onMove(group.uuid),
					})),
					{
						key: "up",
						label: "上移",
						separatorBefore: true,
						onSelect: onMoveUp,
					},
					{ key: "down", label: "下移", onSelect: onMoveDown },
				];
				void showContextMenu(
					{ items, label },
					{ x: rect.right + 6, y: rect.top },
				);
			}}
		>
			{children}
		</div>
	);
}
