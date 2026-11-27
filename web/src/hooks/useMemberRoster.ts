import { useEffect, useMemo } from "react";
import { domainStore, useDomainStore } from "@/stores/domainStore";
import { useSocketStore } from "@/stores/socketStore";
import { useUserStore } from "@/stores/userStore";
import { buildMemberRoster, type MemberRoster } from "./memberRoster";

export type { MemberRoster, RosterMember } from "./memberRoster";

function useCurrentRoomInfo() {
	const rooms = useSocketStore((s) => s.rooms);
	const currentRoom = useSocketStore((s) => s.currentRoom);
	const domainUUID = useDomainStore((s) => s.currentDomainUUID);

	return useMemo(() => {
		const current = rooms.find(
			(r) =>
				(r.domain_uuid || "") === (domainUUID || "") && r.name === currentRoom,
		);
		const liveMembers = current?.members ?? [];
		const onlineIdentities = domainUUID
			? rooms
					.filter((r) => r.domain_uuid === domainUUID)
					.flatMap((r) => r.members.map((m) => m.identity))
			: liveMembers.map((m) => m.identity);
		return { liveMembers, onlineIdentities };
	}, [rooms, currentRoom, domainUUID]);
}

/** 成员列表数据源：域成员全量 + 本域在线状态，无域时退回当前房间在线成员 */
export function useMemberRoster(): MemberRoster {
	const domainUUID = useDomainStore((s) => s.currentDomainUUID);
	const domainMembers = useDomainStore((s) =>
		domainUUID ? s.memberCache[domainUUID] : undefined,
	);
	const memberLoading = useDomainStore((s) =>
		domainUUID ? !!s.memberLoading[domainUUID] : false,
	);
	const memberError = useDomainStore((s) =>
		domainUUID ? s.memberErrors[domainUUID] : null,
	);
	const myUser = useUserStore((s) => s.user);
	const myName = myUser?.name;
	const connected = useSocketStore((s) => s.connected);
	const { liveMembers, onlineIdentities } = useCurrentRoomInfo();

	useEffect(() => {
		if (!domainUUID) return;
		const state = useDomainStore.getState();
		if (
			state.memberCache[domainUUID] !== undefined ||
			state.memberLoading[domainUUID] ||
			state.memberErrors[domainUUID]
		) {
			return;
		}
		void domainStore.loadMembers(domainUUID).catch(() => {});
	}, [domainUUID]);

	const roster = useMemo(
		() =>
			buildMemberRoster({
				domainMembers,
				liveMembers,
				onlineIdentities,
				myName,
				myUser: myUser ?? undefined,
				connected,
			}),
		[domainMembers, liveMembers, onlineIdentities, myName, myUser, connected],
	);

	return {
		...roster,
		loading:
			memberLoading ||
			(!!domainUUID &&
				domainMembers === undefined &&
				!memberError &&
				liveMembers.length === 0),
	};
}
