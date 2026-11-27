import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Domain } from "@/api/domain";
import { DomainSettingsForm } from "./DomainSettingsForm";

Object.defineProperty(globalThis, "ResizeObserver", {
	value: class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
	writable: true,
});

const domain: Domain = {
	id: 1,
	uuid: "d-1",
	name: "测试域",
	icon_url: "",
	description: "描述",
	owner_uuid: "u-1",
	is_public: false,
	created_at: "2026-01-01T00:00:00Z",
};

function renderForm(
	overrides: Partial<React.ComponentProps<typeof DomainSettingsForm>> = {},
) {
	const props = {
		canManage: true,
		domain,
		name: "测试域",
		setName: vi.fn(),
		nameError: "",
		setNameError: vi.fn(),
		description: "",
		setDescription: vi.fn(),
		isPublic: false,
		setIsPublic: vi.fn(),
		requireJoinApproval: false,
		setRequireJoinApproval: vi.fn(),
		iconUrl: "",
		iconUploading: false,
		iconProgress: 0,
		iconError: "",
		onUploadIcon: vi.fn(),
		onRemoveIcon: vi.fn(),
		saving: false,
		formError: "",
		onSave: vi.fn(),
		...overrides,
	};
	return { props, ...render(<DomainSettingsForm {...props} />) };
}

describe("DomainSettingsForm 域头像", () => {
	afterEach(cleanup);

	it("shows the name initial and only the upload button when no icon is set", () => {
		const { container } = renderForm();
		expect(container.querySelector("img")).toBeNull();
		expect(container.textContent).toContain("测");
		expect(screen.getByRole("button", { name: /上传头像/ })).toBeTruthy();
		expect(screen.queryByRole("button", { name: /移除头像/ })).toBeNull();
	});

	it("renders the uploaded image and offers removal", () => {
		const { props, container } = renderForm({
			iconUrl: "https://cdn.example.com/domain-icons/d-1.png",
		});
		expect(container.querySelector("img")?.getAttribute("src")).toBe(
			"https://cdn.example.com/domain-icons/d-1.png",
		);
		fireEvent.click(screen.getByRole("button", { name: /移除头像/ }));
		expect(props.onRemoveIcon).toHaveBeenCalledTimes(1);
	});

	it("hands the selected file to onUploadIcon", () => {
		const { props, container } = renderForm();
		const input = container.querySelector('input[type="file"]');
		if (!input) throw new Error("file input missing");
		const file = new File(["x"], "domain.png", { type: "image/png" });
		fireEvent.change(input, { target: { files: [file] } });
		expect(props.onUploadIcon).toHaveBeenCalledWith(file);
	});

	it("shows upload progress and inline error", () => {
		renderForm({
			iconUploading: true,
			iconProgress: 40,
			iconError: "上传失败",
		});
		expect(screen.getByText(/正在上传 40%/)).toBeTruthy();
		expect(screen.getByRole("alert").textContent).toContain("上传失败");
	});

	it("shows the current avatar read-only without controls", () => {
		const { container } = renderForm({
			canManage: false,
			domain: { ...domain, icon_url: "https://cdn.example.com/ro.png" },
		});
		expect(container.querySelector("img")?.getAttribute("src")).toBe(
			"https://cdn.example.com/ro.png",
		);
		expect(screen.queryByRole("button", { name: /上传头像/ })).toBeNull();
	});
});
