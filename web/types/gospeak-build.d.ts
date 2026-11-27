/**
 * 条件编译注入常量（vite define 注入，见 app/web/vite.config.ts）。
 *
 * 类型定义与 packages/desktop/src/globals.d.ts 保持一致——
 * 该文件只进入 desktop 包自身的 tsc 程序，不会传递到 web，所以这里需要一份副本。
 * 日常业务代码建议 import { DESKTOP_BUILD, inDesktop, ... } from "@gospeak/desktop"，
 * 需要「模块整体不进包」的裁剪点才直接使用这两个 token。
 */
declare const __GOSPEAK_TARGET__: "web" | "desktop" | "mobile";
declare const __GOSPEAK_DESKTOP__: boolean;
declare const __GOSPEAK_MOBILE__: boolean;
/** 前端版本号（取自 app/web/package.json），导出日志时写进报告头。 */
declare const __APP_VERSION__: string;
