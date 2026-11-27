import { createPush, inMobile } from "@gospeak/mobile-capabilities";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { reportPushToken } from "@/api/pushRegistration";
import { navigateByPath } from "./useDeepLinkNavigation";

export function useMobilePush() {
	const router = useRouter();

	useEffect(() => {
		if (!inMobile()) return;
		const push = createPush();
		const unsubscribers: (() => void)[] = [];

		void push.register();
		unsubscribers.push(
			push.onToken((token) => {
				void reportPushToken(token);
			}),
		);
		unsubscribers.push(
			push.onNotificationOpened((data) => {
				const path = data.path;
				if (typeof path === "string") navigateByPath(router, path);
			}),
		);

		return () => {
			for (const off of unsubscribers) off();
		};
	}, [router]);
}
