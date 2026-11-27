import { bridge, command } from "../bridge";
import { isDesktop } from "../runtime";

/**
 * System clipboard for the GOSpeak frontend.
 *
 * The desktop host routes both directions through the Go `Clipboard` binding,
 * so WebView2 never raises its own clipboard permission prompt. A plain browser
 * uses `navigator.clipboard`. Call sites always go through this facade: the
 * page's Web API is never patched at runtime.
 */
export interface Clipboard {
	/** Text from the OS/browser clipboard. Rejects if access is unavailable. */
	readText(): Promise<string>;
	/** Writes text to the OS/browser clipboard. Rejects on failure. */
	writeText(text: string): Promise<void>;
}

type WebClipboard = NonNullable<Navigator["clipboard"]>;

function requireWebClipboard(): WebClipboard {
	if (typeof navigator === "undefined") {
		throw new Error("[gospeak-desktop] navigator is unavailable (SSR/node)");
	}
	const api = navigator.clipboard;
	if (
		!api ||
		typeof api.readText !== "function" ||
		typeof api.writeText !== "function"
	) {
		throw new Error(
			"[gospeak-desktop] navigator.clipboard is unavailable (insecure context or unsupported browser)",
		);
	}
	return api;
}

/** Reports and rethrows, so callers see the original error instead of silence. */
function reportFailure(operation: string, error: unknown): never {
	console.warn(`[gospeak-desktop] clipboard.${operation} failed:`, error);
	throw error;
}

const web: Clipboard = {
	async readText() {
		try {
			return await requireWebClipboard().readText();
		} catch (error) {
			reportFailure("readText", error);
		}
	},
	async writeText(text) {
		try {
			await requireWebClipboard().writeText(text);
		} catch (error) {
			reportFailure("writeText", error);
		}
	},
};

// Command names match the mygo bindings in app/desktop/clipboard.go verbatim.
const native: Clipboard = {
	readText: () => bridge.invoke<string>(command("Clipboard", "ReadText")),
	writeText: (text) =>
		bridge.invoke<void>(command("Clipboard", "WriteText"), text),
};

/** Native host clipboard in the desktop client, Web API fallback in a browser. */
export function createClipboard(): Clipboard {
	return isDesktop() ? native : web;
}
