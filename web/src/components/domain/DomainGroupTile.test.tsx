import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomainGroup } from "@/api/domainLayout";
import DomainGroupTile from "./DomainGroupTile";

Object.defineProperty(globalThis, "ResizeObserver", {
	value: class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
	writable: true,
});

vi.mock("@dnd-kit/core", () => ({
	useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));
vi.mock("@dnd-kit/sortable", () => ({
	SortableContext: ({ children }: { children: React.ReactNode }) => children,
	useSortable: () => ({
		attributes: {},
		listeners: {},
		setNodeRef: vi.fn(),
		transform: null,
		isDragging: false,
	}),
	verticalListSortingStrategy: {},
}));

function fakeRect(top: number, right: number): DOMRect {
	return {
		x: right - 100,
		y: top,
		top,
		right,
		bottom: top + 32,
		left: right - 100,
		width: 100,
		height: 32,
		toJSON: () => ({}),
	} as DOMRect;
}

function getAnchor(container: HTMLElement): HTMLElement {
	const anchors = Array.from(
		container.querySelectorAll<HTMLElement>("div"),
	).filter(
		(el) =>
			el.style.position === "fixed" &&
			el.style.width === "0px" &&
			el.style.height === "0px",
	);
	expect(anchors).toHaveLength(1);
	return anchors[0];
}

const group: DomainGroup = {
	uuid: "g1",
	name: "工作",
	color: "lime",
	sort_order: 0,
};

function renderTile(
	overrides: Partial<React.ComponentProps<typeof DomainGroupTile>> = {},
) {
	const props = {
		group,
		domains: [],
		groups: [group],
		activeDomainUUID: null,
		canMoveUp: false,
		canMoveDown: false,
		onRename: vi.fn(),
		onRecolor: vi.fn(),
		onDelete: vi.fn(),
		onMoveUp: vi.fn(),
		onMoveDown: vi.fn(),
		onSelectDomain: vi.fn(),
		onMoveTo: vi.fn(),
		onReorder: vi.fn(),
		...overrides,
	};
	return { props, ...render(<DomainGroupTile {...props} />) };
}

describe("DomainGroupTile", () => {
	afterEach(cleanup);

	it("右键菜单锚点与分组按钮顶部对齐，而不是鼠标落点", () => {
		const { container } = renderTile();
		const button = screen.getByLabelText("打开分组 工作");
		vi.spyOn(button, "getBoundingClientRect").mockReturnValue(
			fakeRect(91, 260),
		);

		fireEvent.contextMenu(button, { clientX: 999, clientY: 888 });

		const anchor = getAnchor(container);
		expect(anchor.style.top).toBe("91px");
		expect(anchor.style.left).toBe("266px");
		expect(anchor.style.top).not.toBe("894px");
	});

	it("触摸长按打开的菜单同样与分组按钮顶部对齐", async () => {
		vi.useFakeTimers();
		try {
			const { container } = renderTile();
			const button = screen.getByLabelText("打开分组 工作");
			vi.spyOn(button, "getBoundingClientRect").mockReturnValue(
				fakeRect(72, 240),
			);

			fireEvent.pointerDown(button, {
				pointerType: "touch",
				clientX: 40,
				clientY: 700,
			});
			await act(async () => {
				vi.advanceTimersByTime(300);
			});

			const anchor = getAnchor(container);
			expect(anchor.style.top).toBe("72px");
			expect(anchor.style.left).toBe("246px");
			expect(anchor.style.top).not.toBe("706px");
		} finally {
			vi.useRealTimers();
		}
	});

	it("opens the edit panel on right click with name, colors and delete", () => {
		renderTile();
		fireEvent.contextMenu(screen.getByLabelText("打开分组 工作"), {
			clientX: 120,
			clientY: 240,
		});
		expect(screen.getByLabelText("分组名称")).toBeTruthy();
		expect(screen.getByRole("group", { name: "分组颜色" })).toBeTruthy();
		expect(screen.getByText("删除分组")).toBeTruthy();
	});

	it("opens the contents view on left click", () => {
		renderTile();
		fireEvent.click(screen.getByLabelText("打开分组 工作"), {
			clientX: 120,
			clientY: 240,
		});
		expect(screen.queryByLabelText("分组名称")).toBeNull();
		expect(screen.getByText(/空分组/)).toBeTruthy();
	});

	it("does not offer a delete entry for domains", () => {
		renderTile();
		fireEvent.contextMenu(screen.getByLabelText("打开分组 工作"));
		expect(screen.queryByText("删除域")).toBeNull();
	});

	it("shows mini previews of the domains inside a folder", () => {
		const domain = (uuid: string, name: string) => ({
			id: Number(uuid.slice(2)),
			uuid,
			name,
			icon_url: "",
			description: "",
			owner_uuid: "u-1",
			is_public: false,
			created_at: "2026-01-01T00:00:00Z",
			member_count: 1,
			room_count: 0,
		});
		renderTile({
			domains: [domain("d-1", "默"), domain("d-2", "UI审查域")],
		});
		expect(screen.getByText("默")).toBeTruthy();
		expect(screen.getByText("U")).toBeTruthy();
		expect(screen.getByRole("img", { name: "工作 · 2 个域" })).toBeTruthy();
	});

	it("shows uploaded images in the folder preview", () => {
		const domain = (uuid: string, name: string, iconUrl: string) => ({
			id: Number(uuid.slice(2)),
			uuid,
			name,
			icon_url: iconUrl,
			description: "",
			owner_uuid: "u-1",
			is_public: false,
			created_at: "2026-01-01T00:00:00Z",
			member_count: 1,
			room_count: 0,
		});
		const { container } = renderTile({
			domains: [
				domain("d-1", "默", "https://cdn.example.com/d-1.png"),
				domain("d-2", "UI审查域", "https://cdn.example.com/d-2.png"),
			],
		});
		const sources = Array.from(container.querySelectorAll("img")).map((img) =>
			img.getAttribute("src"),
		);
		expect(sources).toEqual([
			"https://cdn.example.com/d-1.png",
			"https://cdn.example.com/d-2.png",
		]);
	});

	it("falls back to the folder glyph for an empty group", () => {
		renderTile();
		expect(screen.queryByText("默")).toBeNull();
	});
});
