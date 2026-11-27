import { afterEach, describe, expect, it } from "vitest";
import { applyPlatformAttributes } from "./platform";

describe("applyPlatformAttributes", () => {
	afterEach(() => {
		delete document.documentElement.dataset.platform;
	});

	it("把构建目标写进 data-platform，供 CSS 分支使用", () => {
		applyPlatformAttributes();
		expect(document.documentElement.dataset.platform).toBe("web");
	});
});
