import { marked } from "marked";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearMarkdownCache, renderMarkdownCached } from "./markdownCache";

describe("renderMarkdownCached", () => {
	afterEach(() => {
		clearMarkdownCache();
		vi.restoreAllMocks();
	});

	it("相同 key 命中缓存，不重复解析", () => {
		const parse = vi.spyOn(marked, "parse");
		const first = renderMarkdownCached("**hello** @alice", "bob");
		expect(parse).toHaveBeenCalledTimes(1);

		expect(renderMarkdownCached("**hello** @alice", "bob")).toBe(first);
		expect(parse).toHaveBeenCalledTimes(1);

		renderMarkdownCached("**hello** @alice", "alice");
		expect(parse).toHaveBeenCalledTimes(2);
	});

	it("超过 200 条按 LRU 淘汰最早项", () => {
		const parse = vi.spyOn(marked, "parse");
		for (let i = 0; i < 200; i++) {
			renderMarkdownCached(`msg-${i}`);
		}
		expect(parse).toHaveBeenCalledTimes(200);

		renderMarkdownCached("msg-0");
		expect(parse).toHaveBeenCalledTimes(200);

		renderMarkdownCached("msg-200");
		expect(parse).toHaveBeenCalledTimes(201);

		renderMarkdownCached("msg-0");
		expect(parse).toHaveBeenCalledTimes(201);

		renderMarkdownCached("msg-1");
		expect(parse).toHaveBeenCalledTimes(202);
	});
});
