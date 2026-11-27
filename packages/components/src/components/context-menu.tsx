import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { Check, ChevronRight } from "lucide-react";
import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root as ReactRoot } from "react-dom/client";
import { cn } from "../lib/utils";

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuGroup = ContextMenuPrimitive.Group;
export const ContextMenuPortal = ContextMenuPrimitive.Portal;
export const ContextMenuSub = ContextMenuPrimitive.Sub;
export const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

export const ContextMenuContent = forwardRef<
	React.ComponentRef<typeof ContextMenuPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, collisionPadding = 8, ...props }, ref) => (
	<ContextMenuPrimitive.Portal>
		<ContextMenuPrimitive.Content
			ref={ref}
			collisionPadding={collisionPadding}
			className={cn(
				"bg-popover text-popover-foreground border-border z-popover min-w-44 overflow-hidden rounded-lg border p-1 shadow-xl",
				className,
			)}
			{...props}
		/>
	</ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = "ContextMenuContent";

export const ContextMenuItem = forwardRef<
	React.ComponentRef<typeof ContextMenuPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
		variant?: "default" | "destructive";
		inset?: boolean;
	}
>(({ className, variant = "default", inset, ...props }, ref) => (
	<ContextMenuPrimitive.Item
		ref={ref}
		className={cn(
			"focus:bg-muted relative flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
			inset && "pl-8",
			variant === "destructive" &&
				"text-destructive focus:bg-destructive/10 focus:text-destructive",
			className,
		)}
		{...props}
	/>
));
ContextMenuItem.displayName = "ContextMenuItem";

export const ContextMenuLabel = forwardRef<
	React.ComponentRef<typeof ContextMenuPrimitive.Label>,
	React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
	<ContextMenuPrimitive.Label
		ref={ref}
		className={cn("text-muted-foreground px-3 py-1.5 text-xs", className)}
		{...props}
	/>
));
ContextMenuLabel.displayName = "ContextMenuLabel";

export const ContextMenuSeparator = forwardRef<
	React.ComponentRef<typeof ContextMenuPrimitive.Separator>,
	React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
	<ContextMenuPrimitive.Separator
		ref={ref}
		className={cn("bg-border -mx-1 my-1 h-px", className)}
		{...props}
	/>
));
ContextMenuSeparator.displayName = "ContextMenuSeparator";

export const ContextMenuShortcut = forwardRef<
	HTMLSpanElement,
	React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
	<span
		ref={ref}
		className={cn(
			"text-faint-foreground ml-auto text-xs tracking-widest",
			className,
		)}
		{...props}
	/>
));
ContextMenuShortcut.displayName = "ContextMenuShortcut";

export const ContextMenuSubTrigger = forwardRef<
	React.ComponentRef<typeof ContextMenuPrimitive.SubTrigger>,
	React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
		inset?: boolean;
	}
>(({ className, inset, children, ...props }, ref) => (
	<ContextMenuPrimitive.SubTrigger
		ref={ref}
		className={cn(
			"focus:bg-muted flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
			inset && "pl-8",
			className,
		)}
		{...props}
	>
		{children}
		<ChevronRight size={14} className="ml-auto" />
	</ContextMenuPrimitive.SubTrigger>
));
ContextMenuSubTrigger.displayName = "ContextMenuSubTrigger";

export const ContextMenuSubContent = forwardRef<
	React.ComponentRef<typeof ContextMenuPrimitive.SubContent>,
	React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
	<ContextMenuPrimitive.SubContent
		ref={ref}
		className={cn(
			"bg-popover text-popover-foreground border-border z-popover min-w-44 overflow-hidden rounded-lg border p-1 shadow-xl",
			className,
		)}
		{...props}
	/>
));
ContextMenuSubContent.displayName = "ContextMenuSubContent";

export const ContextMenuCheckboxItem = forwardRef<
	React.ComponentRef<typeof ContextMenuPrimitive.CheckboxItem>,
	React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
	<ContextMenuPrimitive.CheckboxItem
		ref={ref}
		checked={checked}
		className={cn(
			"focus:bg-muted relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-3 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
			className,
		)}
		{...props}
	>
		<span className="absolute left-2 flex size-4 items-center justify-center">
			<ContextMenuPrimitive.ItemIndicator>
				<Check size={14} />
			</ContextMenuPrimitive.ItemIndicator>
		</span>
		{children}
	</ContextMenuPrimitive.CheckboxItem>
));
ContextMenuCheckboxItem.displayName = "ContextMenuCheckboxItem";

export const ContextMenuRadioItem = forwardRef<
	React.ComponentRef<typeof ContextMenuPrimitive.RadioItem>,
	React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
	<ContextMenuPrimitive.RadioItem
		ref={ref}
		className={cn(
			"focus:bg-muted relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-3 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
			className,
		)}
		{...props}
	>
		<span className="absolute left-2 flex size-4 items-center justify-center">
			<ContextMenuPrimitive.ItemIndicator>
				<span className="bg-current size-2 rounded-full" />
			</ContextMenuPrimitive.ItemIndicator>
		</span>
		{children}
	</ContextMenuPrimitive.RadioItem>
));
ContextMenuRadioItem.displayName = "ContextMenuRadioItem";

export interface ContextMenuItemDescriptor {
	key?: string;
	label: ReactNode;
	onSelect?: () => void;
	disabled?: boolean;
	variant?: "default" | "destructive";
	separatorBefore?: boolean;
}

export interface ShowContextMenuOptions {
	items: ContextMenuItemDescriptor[];
	label?: ReactNode;
}

let activeRoot: ReactRoot | null = null;
let activeCleanup: (() => void) | null = null;

function ImperativeContextMenu({
	items,
	label,
	point,
	onClose,
}: ShowContextMenuOptions & {
	point: { x: number; y: number };
	onClose: () => void;
}) {
	const triggerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const trigger = triggerRef.current;
		if (!trigger) return;
		const event = new MouseEvent("contextmenu", {
			bubbles: true,
			cancelable: true,
			clientX: point.x,
			clientY: point.y,
		});
		trigger.dispatchEvent(event);
	}, [point.x, point.y]);

	return (
		<ContextMenu onOpenChange={(next) => next || onClose()}>
			<ContextMenuTrigger asChild>
				<div
					ref={triggerRef}
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
			</ContextMenuTrigger>
			<ContextMenuContent>
				{label != null ? <ContextMenuLabel>{label}</ContextMenuLabel> : null}
				{items.map((item) => (
					<div key={item.key ?? String(item.label)}>
						{item.separatorBefore ? <ContextMenuSeparator /> : null}
						<ContextMenuItem
							variant={item.variant}
							disabled={item.disabled}
							onSelect={() => {
								item.onSelect?.();
								onClose();
							}}
						>
							{item.label}
						</ContextMenuItem>
					</div>
				))}
			</ContextMenuContent>
		</ContextMenu>
	);
}

export function showContextMenu(
	options: ShowContextMenuOptions,
	point: { x: number; y: number },
): Promise<void> {
	closeContextMenu();
	const host = document.createElement("div");
	document.body.appendChild(host);

	return new Promise<void>((resolve) => {
		let finished = false;
		const root = createRoot(host);
		activeRoot = root;
		const cleanup = () => {
			if (finished) return;
			finished = true;
			root.unmount();
			host.remove();
			if (activeRoot === root) {
				activeRoot = null;
				activeCleanup = null;
			}
			resolve();
		};
		activeCleanup = cleanup;
		flushSync(() => {
			root.render(
				<ImperativeContextMenu {...options} point={point} onClose={cleanup} />,
			);
		});
	});
}

export function closeContextMenu(): void {
	activeCleanup?.();
}
