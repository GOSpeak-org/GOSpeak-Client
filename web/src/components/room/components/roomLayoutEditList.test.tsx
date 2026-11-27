import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RoomLayoutEditList, { type EditBlock } from "./roomLayoutEditList";

Object.defineProperty(globalThis, "ResizeObserver", {
	value: class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
	writable: true,
});

const room = (uuid: string, name: string) => ({
	id: 1,
	uuid,
	name,
	type: "voice" as const,
	count: 0,
	limit: 0,
	domain_uuid: "d-1",
	has_password: false,
	members: [],
});

function blocks(): EditBlock[] {
	return [
		{ uuid: "g-1", name: "周末开黑", rooms: [room("r-1", "大厅")] },
		{ uuid: "__ungrouped__", name: "未分组", rooms: [room("r-2", "综合")] },
	];
}

describe("RoomLayoutEditList", () => {
	afterEach(cleanup);

	it("renders room rows with type icon and capacity", () => {
		render(
			<RoomLayoutEditList
				blocks={blocks()}
				onChange={vi.fn()}
				onSave={vi.fn()}
				saving={false}
			/>,
		);
		expect(screen.getByText("大厅")).toBeTruthy();
		expect(screen.getAllByText("0/0")).toHaveLength(2);
	});

	it("adds a new group in its own row right above 未分组", () => {
		const onChange = vi.fn();
		render(
			<RoomLayoutEditList
				blocks={blocks()}
				onChange={onChange}
				onSave={vi.fn()}
				saving={false}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "新建分组" }));
		const next = onChange.mock.calls[0][0] as EditBlock[];
		expect(next).toHaveLength(3);
		expect(next[0].name).toBe("新分组");
		expect(next[0].rooms).toEqual([]);
		expect(next[0].uuid).not.toBe("");
		expect(next[1].uuid).toBe("g-1");
		expect(next[2].uuid).toBe("__ungrouped__");
	});

	it("keeps generated group names unique", () => {
		const onChange = vi.fn();
		const withExisting = [
			...blocks().slice(0, 1),
			{ uuid: "g-2", name: "新分组", rooms: [] },
			{ uuid: "__ungrouped__", name: "未分组", rooms: [] },
		];
		render(
			<RoomLayoutEditList
				blocks={withExisting}
				onChange={onChange}
				onSave={vi.fn()}
				saving={false}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "新建分组" }));
		const next = onChange.mock.calls[0][0] as EditBlock[];
		expect(next.map((b) => b.name)).toContain("新分组 2");
	});
});
