import { toast } from "@gospeak/components";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Search, Shuffle } from "lucide-react";
import { socketStore } from "@/stores/socketStore";

interface DiscoverHeroProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: (event: React.FormEvent) => void;
}

export default function DiscoverHero(props: DiscoverHeroProps) {
	const navigate = useNavigate();
	const currentDomainUUID = socketStore.currentDomainUUID();

	const handleJoinRandom = () => {
		if (!currentDomainUUID) {
			toast.warning("请先选择域");
			return;
		}
		const rooms = socketStore
			.rooms()
			.filter(
				(room) =>
					room.count < room.limit &&
					(room.domain_uuid || "") === currentDomainUUID,
			);
		if (rooms.length === 0) {
			toast.warning("当前域没有可加入的房间");
			return;
		}
		const target = [...rooms].sort((a, b) => b.count - a.count)[0];
		socketStore.selectRoom(target);
		if (target.domain_uuid)
			navigate({
				to: "/domain/$domainUUID",
				params: { domainUUID: target.domain_uuid },
			});
		else navigate({ to: "/discover" });
	};

	const handleGoDomain = () => {
		if (currentDomainUUID)
			navigate({
				to: "/domain/$domainUUID",
				params: { domainUUID: currentDomainUUID },
			});
		else toast.warning("请先选择域");
	};

	const chipClass =
		"border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-pill border px-3 text-xs transition-colors";

	return (
		<section className="bg-primary relative overflow-hidden rounded-panel px-6 py-5 md:px-8">
			<div
				className="pointer-events-none absolute inset-0 opacity-30"
				aria-hidden="true"
				style={{
					backgroundImage:
						"linear-gradient(to right, color-mix(in oklab, var(--primary-foreground) 12%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--primary-foreground) 12%, transparent) 1px, transparent 1px)",
					backgroundSize: "32px 32px",
					// ui-token-ignore: mask 仅取 alpha 通道，black 表示完全不透明，不承载可见颜色
					maskImage: "linear-gradient(to bottom, black, transparent 85%)",
				}}
			/>
			<div
				className="bg-primary-foreground/10 pointer-events-none absolute -top-20 -right-16 size-72 rounded-full blur-2xl"
				aria-hidden="true"
			/>
			<div
				className="bg-primary-foreground/5 pointer-events-none absolute -right-10 bottom-0 size-48 rounded-full blur-xl"
				aria-hidden="true"
			/>
			<div className="relative">
				<h1 className="text-primary-foreground text-xl font-bold">
					找到你的下一个语音房
				</h1>
				<p className="text-muted-primary-foreground mt-0.5 text-sm">
					搜索公开语音域，或粘贴好友的邀请码即刻加入
				</p>
				<form onSubmit={props.onSubmit} className="mt-3 flex max-w-xl gap-2">
					<input
						type="text"
						value={props.value}
						onChange={(e) => props.onChange(e.currentTarget.value)}
						placeholder="搜索域名称 / 描述，或粘贴邀请码…"
						aria-label="搜索公开域或输入邀请码"
						className="border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground placeholder:text-faint-primary-foreground h-9 min-w-0 flex-1 rounded-field border px-3 text-sm outline-none"
					/>
					<button
						type="submit"
						className="bg-primary-foreground text-primary inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-field px-4 text-sm font-medium transition-opacity hover:opacity-90"
					>
						<Search size={16} />
						搜索
					</button>
				</form>
				<div className="mt-3 flex flex-wrap gap-2">
					<button
						type="button"
						className={chipClass}
						onClick={handleJoinRandom}
					>
						<Shuffle size={16} />
						随机加入房间
					</button>
					<button type="button" className={chipClass} onClick={handleGoDomain}>
						<ArrowUpRight size={16} />
						前往我的域
					</button>
				</div>
			</div>
		</section>
	);
}
