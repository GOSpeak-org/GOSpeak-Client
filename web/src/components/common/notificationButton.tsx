import {
	Badge,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@gospeak/components";
import { Bell } from "lucide-react";
import {
	notificationStore,
	useNotificationStore,
} from "@/stores/notificationStore";

/** 顶栏通知入口：铃铛 + 未读数字徽章，点击打开通知弹窗。 */
export default function NotificationButton() {
	const unreadCount = useNotificationStore((s) => s.unreadCount);

	return (
		<TooltipProvider delayDuration={150}>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						className="hover:bg-muted relative flex shrink-0 cursor-pointer items-center justify-center rounded-sm px-2 py-1 text-xs transition-colors after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-''"
						onClick={() => notificationStore.openModal()}
						aria-label="通知"
					>
						<span className="relative inline-flex">
							<Bell className="size-4" strokeWidth={1.5} />
							{unreadCount > 0 && (
								<span className="absolute -top-1.5 -right-2">
									<Badge count={unreadCount} />
								</span>
							)}
						</span>
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">通知</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
