import * as PopoverPrimitive from "@radix-ui/react-popover";
import { forwardRef } from "react";
import { cn } from "../lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export const PopoverContent = forwardRef<
	React.ComponentRef<typeof PopoverPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(
	(
		{
			className,
			align = "center",
			sideOffset = 6,
			collisionPadding = 8,
			...props
		},
		ref,
	) => (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Content
				ref={ref}
				align={align}
				sideOffset={sideOffset}
				collisionPadding={collisionPadding}
				className={cn(
					"bg-popover text-popover-foreground border-border z-popover rounded-lg border p-3 shadow-xl outline-none",
					className,
				)}
				{...props}
			/>
		</PopoverPrimitive.Portal>
	),
);
PopoverContent.displayName = "PopoverContent";
