import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
	showContextMenu,
} from "./context-menu";

const meta: Meta<typeof ContextMenu> = {
	title: "UI/ContextMenu",
	component: ContextMenu,
};
export default meta;

export const Default: StoryObj = {
	render: () => (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div className="bg-muted flex h-40 w-80 items-center justify-center rounded-lg border border-dashed">
					右键点击这里
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuLabel>操作</ContextMenuLabel>
				<ContextMenuItem>
					复制 <ContextMenuShortcut>⌘C</ContextMenuShortcut>
				</ContextMenuItem>
				<ContextMenuItem>
					粘贴 <ContextMenuShortcut>⌘V</ContextMenuShortcut>
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem variant="destructive">删除</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	),
};

export const WithSubmenu: StoryObj = {
	render: () => (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div className="bg-muted flex h-40 w-80 items-center justify-center rounded-lg border border-dashed">
					右键点击这里
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem>编辑</ContextMenuItem>
				<ContextMenuSub>
					<ContextMenuSubTrigger>移到分组</ContextMenuSubTrigger>
					<ContextMenuSubContent>
						<ContextMenuItem>分组 A</ContextMenuItem>
						<ContextMenuItem>分组 B</ContextMenuItem>
					</ContextMenuSubContent>
				</ContextMenuSub>
				<ContextMenuSeparator />
				<ContextMenuItem variant="destructive">删除</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	),
};

export const Imperative: StoryObj = {
	render: () => (
		<Button
			type="button"
			onClick={(event) => {
				void showContextMenu(
					{
						label: "动态菜单",
						items: [
							{ key: "rename", label: "重命名" },
							{ key: "duplicate", label: "创建副本" },
							{
								key: "delete",
								label: "删除",
								variant: "destructive",
								separatorBefore: true,
							},
						],
					},
					{ x: event.clientX, y: event.clientY },
				);
			}}
		>
			打开命令式菜单
		</Button>
	),
};
