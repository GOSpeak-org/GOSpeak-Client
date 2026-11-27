import { afterEach, describe, expect, it } from "vitest";
import { openFileDialog } from "./dialog";

interface FakeFileInput {
	type: string;
	multiple: boolean;
	files: { name: string }[] | null;
	onchange: (() => void) | null;
	oncancel: (() => void) | null;
	listeners: Map<string, (() => void)[]>;
	addEventListener(type: string, cb: () => void): void;
	click(): void;
}

let lastInput: FakeFileInput | null = null;

function installDocument(): void {
	lastInput = null;
	(globalThis as unknown as { document: unknown }).document = {
		createElement: () => {
			const listeners = new Map<string, (() => void)[]>();
			const input: FakeFileInput = {
				type: "",
				multiple: false,
				files: null,
				onchange: null,
				oncancel: null,
				listeners,
				addEventListener(type, cb) {
					const list = listeners.get(type) ?? [];
					list.push(cb);
					listeners.set(type, list);
				},
				click() {},
			};
			lastInput = input;
			return input;
		},
	};
}

function requireInput(): FakeFileInput {
	if (!lastInput) throw new Error("openFileDialog did not create an input");
	return lastInput;
}

afterEach(() => {
	delete (globalThis as unknown as { document?: unknown }).document;
	lastInput = null;
});

describe("openFileDialog / 浏览器降级", () => {
	it("选择文件后 resolve 文件名数组", async () => {
		installDocument();
		const result = openFileDialog({ multiple: true });
		const input = requireInput();
		expect(input.type).toBe("file");
		expect(input.multiple).toBe(true);

		input.files = [{ name: "a.wav" }, { name: "b.mp3" }];
		input.onchange?.();
		await expect(result).resolves.toEqual(["a.wav", "b.mp3"]);
	});

	it("用户取消时经 oncancel 属性 resolve 空数组", async () => {
		installDocument();
		const result = openFileDialog();
		requireInput().oncancel?.();
		await expect(result).resolves.toEqual([]);
	});

	it("oncancel 不可用时经 cancel 事件兜底 resolve 空数组", async () => {
		installDocument();
		const result = openFileDialog();
		const input = requireInput();
		// 模拟只支持 addEventListener 的 WebView：忽略 oncancel 属性赋值。
		input.oncancel = null;
		for (const cb of input.listeners.get("cancel") ?? []) cb();
		await expect(result).resolves.toEqual([]);
	});
});
