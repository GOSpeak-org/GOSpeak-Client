import { useQuery } from "@tanstack/react-query";
import { Activity, Headphones, Radio, Users } from "lucide-react";
import { getMyDomainsDetailed } from "@/api/domain";
import { useSocketStore } from "@/stores/socketStore";

export default function StatusOverview() {
	const connected = useSocketStore((s) => s.connected);

	const { data: domains } = useQuery({
		queryKey: ["my-domains-detailed"],
		queryFn: getMyDomainsDetailed,
	});

	const myDomains = domains ?? [];
	const totalMembers = myDomains.reduce((sum, d) => sum + d.member_count, 0);
	const totalRooms = myDomains.reduce((sum, d) => sum + d.room_count, 0);

	const stats = [
		{
			label: "连接状态",
			value: connected ? "已连接" : "已断开",
			hint: connected ? "语音服务正常" : "正在重连…",
			icon: Activity,
		},
		{
			label: "我的域",
			value: String(myDomains.length),
			hint: "已加入的语音空间",
			icon: Headphones,
		},
		{
			label: "域内成员",
			value: String(totalMembers),
			hint: "全部我的域累计",
			icon: Users,
		},
		{
			label: "语音频道",
			value: String(totalRooms),
			hint: "全部我的域累计",
			icon: Radio,
		},
	];

	return (
		<div className="flex h-full min-h-0 flex-col overflow-y-auto px-3 py-4">
			<div className="mb-4 min-w-0">
				<h2 className="text-lg font-semibold">状态概览</h2>
				<p className="text-muted-foreground text-sm">当前账号与语音状态</p>
			</div>
			<div className="flex flex-col gap-2">
				{stats.map((stat) => (
					<div
						key={stat.label}
						className="flex items-center gap-3 border-b border-border py-2.5 last:border-0"
					>
						<stat.icon size={20} className="text-muted-foreground shrink-0" />
						<div className="min-w-0 flex-1">
							<div className="text-muted-foreground text-2xs">{stat.label}</div>
							<div className="mt-0.5 truncate text-sm font-semibold">
								{stat.value}
							</div>
							<div className="text-muted-foreground mt-0.5 truncate text-2xs">
								{stat.hint}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
