import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomLayoutView } from "@/api/domain";
import DomainRoomLayoutPanel from "./DomainRoomLayoutPanel";

const mocks = vi.hoisted(() => ({
	saveRoomLayout: vi.fn(),
	toastSuccess: vi.fn(),
	toastActionError: vi.fn(),
}));

vi.mock("@/api/domain", () => ({
	saveRoomLayout: (...args: unknown[]) => mocks.saveRoomLayout(...args),
}));
vi.mock("@gospeak/components", () => ({
	Button: ({
		children,
		...rest
	}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button {...rest}>{children}</button>
	),
	Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
		<input {...props} />
	),
	toast: { success: mocks.toastSuccess },
}));
vi.mock("@/utils/toast", () => ({
	toastActionError: (...args: unknown[]) => mocks.toastActionError(...args),
}));
vi.mock("@/utils/apiError", () => ({
	apiErrorMessage: (e: unknown) => String(e),
}));
vi.mock("@dnd-kit/core", () => ({
	DndContext: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DragOverlay: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	PointerSensor: class {},
	closestCenter: () => ({}),
	useSensor: () => ({}),
	useSensors: () => [],
}));
vi.mock("@dnd-kit/sortable", () => ({
	SortableContext: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	useSortable: () => ({
		attributes: {},
		listeners: {},
		setNodeRef: () => {},
		transform: null,
		transition: undefined,
	}),
	verticalListSortingStrategy: {},
}));
vi.mock("@dnd-kit/utilities", () => ({
	CSS: { Transform: { toString: () => "" } },
}));

const layout: RoomLayoutView = {
	groups: [
		{
			uuid: "g1",
			name: "常用",
			sort_order: 0,
			rooms: [
				{
					uuid: "r1",
					name: "房间1",
					count: 0,
					has_password: false,
					sort_order: 0,
				},
			],
		},
	],
	ungrouped: [
		{ uuid: "r2", name: "房间2", count: 0, has_password: false, sort_order: 0 },
	],
	ungrouped_position: 1,
	can_manage: true,
};

describe("DomainRoomLayoutPanel", () => {
	beforeEach(() => {
		mocks.saveRoomLayout.mockReset().mockResolvedValue({});
	});
	afterEach(cleanup);

	it("只读模式不显示编辑控件", () => {
		render(
			<DomainRoomLayoutPanel
				domainUUID="d1"
				layout={{ ...layout, can_manage: false }}
			/>,
		);
		expect(screen.queryByText("保存布局")).toBeNull();
		expect(screen.queryByText("新增分组")).toBeNull();
	});

	it("可以新增分组", () => {
		render(<DomainRoomLayoutPanel domainUUID="d1" layout={layout} />);
		expect(screen.getAllByDisplayValue("常用")).toHaveLength(1);
		fireEvent.click(screen.getByText("新增分组"));
		expect(screen.getAllByDisplayValue("新分组")).toHaveLength(1);
	});

	it("保存时提交完整布局", async () => {
		render(<DomainRoomLayoutPanel domainUUID="d1" layout={layout} />);
		fireEvent.click(screen.getByText("保存布局"));
		await vi.waitFor(() =>
			expect(mocks.saveRoomLayout).toHaveBeenCalledTimes(1),
		);
		const req = mocks.saveRoomLayout.mock.calls[0][0];
		expect(req.domain_uuid).toBe("d1");
		expect(req.ungrouped_position).toBe(1);
		expect(req.ungrouped_room_uuids).toEqual(["r2"]);
		expect(req.groups[0]).toMatchObject({
			uuid: "g1",
			name: "常用",
			room_uuids: ["r1"],
		});
	});
});
