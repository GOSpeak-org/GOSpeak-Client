import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@gospeak/components";
import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import NotificationButton from "@/components/common/notificationButton";
import { useRouteTitle } from "@/components/titleBar/useRouteTitle";
import { initTheme, toggleDark, useThemeStore } from "@/stores/themeStore";
import ConnectionIndicator from "./connectionIndicator";

export default function Header() {
	const isDark = useThemeStore((s) => s.isDark);
	// 与桌面标题栏共用同一套标题推导
	const title = useRouteTitle();

	useEffect(() => {
		initTheme();
	}, []);

	return (
		<div className="bg-muted surface-glass text-foreground flex select-none items-center justify-between overflow-hidden px-2 py-0.5 text-xs">
			<div className="flex flex-1 items-center gap-1.5">
				<img
					src="/favicon-256.png"
					alt="GOSpeak"
					className="border-foreground/10 size-4 rounded-sm border"
				/>
				<span className="text-xs font-bold tracking-tight">
					GO<span className="text-primary">Speak</span>
				</span>
			</div>
			<div className="flex items-center justify-center">{title}</div>
			<div className="flex flex-1 items-center justify-end gap-1">
				<ConnectionIndicator />
				<NotificationButton />
				<TooltipProvider delayDuration={150}>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								className="hover:bg-muted flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors"
								onClick={() => toggleDark()}
								aria-label={isDark ? "切换到浅色" : "切换到深色"}
							>
								<span className="text-muted-foreground text-xs">
									{isDark ? "深色" : "浅色"}
								</span>
								{isDark ? (
									<Moon className="size-4" />
								) : (
									<Sun className="size-4" />
								)}
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							{isDark ? "切换到浅色" : "切换到深色"}
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>
		</div>
	);
}
