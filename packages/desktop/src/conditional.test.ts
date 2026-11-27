import { describe, expect, it } from "vitest";
import {
	BUILD_TARGET,
	DESKTOP_BUILD,
	WEB_BUILD,
	assertDesktop,
	desktopOnly,
	ifDesktop,
	importDesktop,
	importWeb,
	inDesktop,
	webOnly,
} from "./conditional";
import { isDesktop } from "./runtime";

// 期望值直接取打包器注入的字面量，而不是 process.env：GOSPEAK_TARGET 只是
// vitest.config.ts 决定注入值的输入，注入值才是 BUILD_TARGET 的事实源。
const INJECTED_TARGET = __GOSPEAK_TARGET__;
const injectedDesktop = __GOSPEAK_DESKTOP__;

describe("conditional / 构建目标常量", () => {
	it("BUILD_TARGET 与注入的 __GOSPEAK_TARGET__ 一致", () => {
		expect(BUILD_TARGET).toBe(INJECTED_TARGET);
		expect(["web", "desktop", "mobile"]).toContain(INJECTED_TARGET);
	});

	it("DESKTOP_BUILD / WEB_BUILD 互斥且自洽", () => {
		expect(DESKTOP_BUILD).toBe(INJECTED_TARGET === "desktop");
		expect(DESKTOP_BUILD).toBe(injectedDesktop);
		expect(WEB_BUILD).toBe(!DESKTOP_BUILD);
	});
});

describe("conditional / 运行时兼容", () => {
	it("inDesktop：桌面构建恒 true，否则等于运行时 isDesktop()", () => {
		if (DESKTOP_BUILD) {
			expect(inDesktop()).toBe(true);
			return;
		}
		// node 测试环境没有 MyGo 注入，runtime 检测必须是 false
		expect(isDesktop()).toBe(false);
		expect(inDesktop()).toBe(false);
	});

	it("inDesktop：Web 构建下 MyGo 宿主存在时回退为 true", () => {
		const globals = globalThis as { mygo?: unknown };
		const previous = globals.mygo;
		globals.mygo = {};
		try {
			expect(isDesktop()).toBe(true);
			expect(inDesktop()).toBe(true);
		} finally {
			if (previous === undefined) {
				delete globals.mygo;
			} else {
				globals.mygo = previous;
			}
		}
	});

	it("assertDesktop：Web 构建中抛错，桌面构建中放行", () => {
		if (DESKTOP_BUILD) {
			expect(() => assertDesktop("overlay")).not.toThrow();
		} else {
			expect(() => assertDesktop("overlay")).toThrow(/\[gospeak\/desktop\]/);
		}
	});
});

describe("conditional / 分支工具", () => {
	it("ifDesktop 只执行当前构建目标的分支", () => {
		const result = ifDesktop(
			() => "desktop-branch",
			() => "web-branch",
		);
		expect(result).toBe(DESKTOP_BUILD ? "desktop-branch" : "web-branch");
	});

	it("desktopOnly：Web 构建返回 fallback，桌面构建返回实现", () => {
		const result = desktopOnly(
			() => "native",
			() => "fallback",
		);
		expect(result).toBe(DESKTOP_BUILD ? "native" : "fallback");
		expect(desktopOnly(() => "native")).toBe(
			DESKTOP_BUILD ? "native" : undefined,
		);
	});

	it("webOnly：桌面构建返回 fallback，Web 构建返回实现", () => {
		const result = webOnly(
			() => "browser",
			() => "fallback",
		);
		expect(result).toBe(DESKTOP_BUILD ? "fallback" : "browser");
	});

	it("importDesktop / importWeb：非目标构建不执行 loader", async () => {
		let desktopLoaded = false;
		let webLoaded = false;
		const desktopLoader = async () => {
			desktopLoaded = true;
			return { marker: "desktop" };
		};
		const webLoader = async () => {
			webLoaded = true;
			return { marker: "web" };
		};

		const d = await importDesktop(desktopLoader);
		const w = await importWeb(webLoader);

		if (DESKTOP_BUILD) {
			expect(d).toEqual({ marker: "desktop" });
			expect(desktopLoaded).toBe(true);
			expect(w).toBeNull();
			expect(webLoaded).toBe(false);
		} else {
			expect(d).toBeNull();
			expect(desktopLoaded).toBe(false);
			expect(w).toEqual({ marker: "web" });
			expect(webLoaded).toBe(true);
		}
	});
});
