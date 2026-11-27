import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@gospeak/components";

describe("@gospeak/components DropdownMenu", () => {
	it("trigger exposes menu semantics", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger aria-label="更多操作">...</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem>踢出房间</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);
		const trigger = screen.getByRole("button", { name: "更多操作" });
		expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
	});

	it("destructive item uses destructive token class", () => {
		render(
			<DropdownMenu open>
				<DropdownMenuTrigger>trigger</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem variant="destructive">删除</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);
		expect(screen.getByRole("menuitem", { name: "删除" }).className).toContain(
			"text-destructive",
		);
	});
});
