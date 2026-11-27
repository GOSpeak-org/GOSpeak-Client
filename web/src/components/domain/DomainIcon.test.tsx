import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DomainIcon from "./DomainIcon";

describe("DomainIcon", () => {
	it("renders no button when used as a presentational chip", () => {
		const { container } = render(
			<DomainIcon name="测试域" interactive={false} />,
		);
		expect(container.querySelector("button")).toBeNull();
		expect(container.textContent).toContain("测");
	});

	it("keeps button behavior by default", () => {
		const { container } = render(<DomainIcon name="测试域" />);
		expect(container.querySelectorAll("button")).toHaveLength(1);
	});

	it("renders the uploaded domain image when icon_url is set", () => {
		const { container } = render(
			<DomainIcon
				name="测试域"
				iconUrl="https://cdn.example.com/domain-icons/d-1.png"
				interactive={false}
			/>,
		);
		expect(container.querySelector("img")?.getAttribute("src")).toBe(
			"https://cdn.example.com/domain-icons/d-1.png",
		);
		expect(container.textContent).not.toContain("测");
	});

	it("falls back to the name initial when icon_url is empty", () => {
		const { container } = render(<DomainIcon name="测试域" iconUrl="" />);
		expect(container.querySelector("img")).toBeNull();
		expect(container.textContent).toContain("测");
	});
});
