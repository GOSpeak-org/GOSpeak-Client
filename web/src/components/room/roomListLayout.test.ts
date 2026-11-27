import { describe, expect, it } from "vitest";
import type { RoomListLayoutPayload } from "@/protocol/generated/payloads";
import type { RoomInfo } from "@/socket/types";
import {
	groupRoomsForSidebar,
	visibleRowsAfterCollapse,
} from "./roomListUtils";

function room(
	uuid: string,
	name: string,
	groupUUID?: string,
	sortOrder = 0,
): RoomInfo {
	return {
		id: 1,
		uuid,
		name,
		has_password: false,
		limit: 10,
		members: [],
		count: 0,
		group_uuid: groupUUID,
		sort_order: sortOrder,
	};
}

const layout: RoomListLayoutPayload = {
	groups: [{ uuid: "g1", name: "常用", sort_order: 0 }],
	ungrouped_position: 0,
};

describe("groupRoomsForSidebar", () => {
	it("未分组区块位于指定位置且组内按 sort_order 排序", () => {
		const rooms = [
			room("r1", "a", "g1", 0),
			room("r2", "b", "g1", 1),
			room("r3", "c"),
		];
		const rows = groupRoomsForSidebar(rooms, layout);
		const flat = rows.map((row) =>
			row.kind === "group" ? `group:${row.name}` : `room:${row.room.uuid}`,
		);
		expect(flat).toEqual(["room:r3", "group:常用", "room:r1", "room:r2"]);
	});

	it("未分组区块在分组之后时顺序正确", () => {
		const rooms = [room("r1", "a", "g1", 0), room("r3", "c")];
		const rows = groupRoomsForSidebar(rooms, {
			...layout,
			ungrouped_position: 1,
		});
		expect(rows[0]).toMatchObject({ kind: "group", name: "常用" });
		expect(rows[rows.length - 1]).toMatchObject({
			kind: "room",
			room: { uuid: "r3" },
		});
	});

	it("空布局时全部房间作为未分组平铺", () => {
		const rows = groupRoomsForSidebar([room("r1", "a")], {
			groups: [],
			ungrouped_position: 0,
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ kind: "room", room: { uuid: "r1" } });
	});

	it("未分组房间携带独立 blockUUID，收起分组不影响其可见性", () => {
		const rows = groupRoomsForSidebar(
			[room("r1", "a", "g1"), room("r3", "c")],
			{ ...layout, ungrouped_position: 1 },
		);
		const groupedRoom = rows.find(
			(r) => r.kind === "room" && r.room.uuid === "r1",
		);
		const ungroupedRoom = rows.find(
			(r) => r.kind === "room" && r.room.uuid === "r3",
		);
		expect(groupedRoom).toMatchObject({ blockUUID: "g1" });
		expect(ungroupedRoom).toMatchObject({ blockUUID: "__ungrouped__" });
	});
	it("布局里没有对应分组时，房间仍作为未分组可见（不静默消失）", () => {
		const rows = groupRoomsForSidebar(
			[room("r1", "a", "ghost-group"), room("r2", "b")],
			layout,
		);
		const roomRows = rows.filter((row) => row.kind === "room");
		expect(roomRows.map((row) => row.room.uuid).sort()).toEqual(["r1", "r2"]);
		for (const row of roomRows) expect(row.blockUUID).toBe("__ungrouped__");
	});
	it("收起分组后组内房间从行列表移除，未分组内容随之上移", () => {
		const rows = groupRoomsForSidebar(
			[room("r1", "a", "g1"), room("r2", "b", "g1"), room("r3", "c")],
			{ ...layout, ungrouped_position: 1 },
		);
		const collapsed = visibleRowsAfterCollapse(rows, { g1: true });
		expect(
			collapsed.map((row) =>
				row.kind === "group" ? `group:${row.name}` : `room:${row.room.uuid}`,
			),
		).toEqual(["group:常用", "room:r3"]);
		expect(visibleRowsAfterCollapse(rows, {})).toHaveLength(4);
		expect(
			visibleRowsAfterCollapse(rows, { __ungrouped__: true }),
		).toHaveLength(3);
	});
});
