import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { forwardRef } from "react";
import { cn } from "../lib/utils";

/** 基于 Radix Tooltip 的纯文本提示，替代手写 group-hover 气泡。 */
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

/** 纯文本 tooltip 的统一外观：与侧栏图标 tooltip 共用同一套类名。 */
export const TOOLTIP_CONTENT_CLASS =
	"bg-neutral text-neutral-foreground pointer-events-none rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap shadow-lg";

export const TooltipContent = forwardRef<
	React.ComponentRef<typeof TooltipPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, collisionPadding = 8, ...props }, ref) => (
	<TooltipPrimitive.Portal>
		<TooltipPrimitive.Content
			ref={ref}
			sideOffset={sideOffset}
			collisionPadding={collisionPadding}
			className={cn(TOOLTIP_CONTENT_CLASS, "z-popover", className)}
			{...props}
		/>
	</TooltipPrimitive.Portal>
));
TooltipContent.displayName = "TooltipContent";
