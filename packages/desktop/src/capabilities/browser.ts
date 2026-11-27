import { bridge, command } from "../bridge";
import { isDesktop } from "../runtime";

export interface Browser {
	openExternal(url: string): Promise<void>;
}

/** Open an external link in the system browser (desktop) or a new tab (web). */
export function createBrowser(): Browser {
	return {
		openExternal(url: string): Promise<void> {
			if (isDesktop()) {
				return bridge.invoke<void>(command("Browser", "OpenExternal"), url);
			}
			if (typeof window !== "undefined") {
				window.open(url, "_blank", "noopener,noreferrer");
			}
			return Promise.resolve();
		},
	};
}
