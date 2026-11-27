import { createKeyboard, inMobile } from "@gospeak/mobile-capabilities";
import { useEffect } from "react";

function isEditable(element: Element | null): element is HTMLElement {
	if (!(element instanceof HTMLElement)) return false;
	if (element.tagName === "INPUT" || element.tagName === "TEXTAREA")
		return true;
	return element.isContentEditable;
}

/**
 * 键盘弹出后把当前输入焦点拉进可视区。
 *
 * iOS 的 WebView 内缩交给 @capacitor/keyboard 原生完成；这里只处理「输入框位于
 * 内部滚动容器、系统没有自动滚动」的情况。block: nearest 在元素已可见时不滚动，
 * 因此不会与原生内缩叠加出跳动。移动端以外的目标不注册任何监听。
 */
export function useMobileKeyboard() {
	useEffect(() => {
		if (!inMobile()) return;
		const keyboard = createKeyboard();
		return keyboard.onShow(() => {
			const active = document.activeElement;
			if (!isEditable(active)) return;
			active.scrollIntoView({ block: "nearest", inline: "nearest" });
		});
	}, []);
}
