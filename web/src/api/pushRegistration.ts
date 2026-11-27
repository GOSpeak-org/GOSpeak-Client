import { inMobile } from "@gospeak/mobile-capabilities";
import apiClient from "@/api/apiClient";

type PushTokenReporter = (token: string) => void | Promise<void>;

let reporter: PushTokenReporter | null = null;

export function setPushTokenReporter(fn: PushTokenReporter): void {
	reporter = fn;
}

/** 默认上报通道：失败只记日志，推送上报是后台旁路，不影响调用方。 */
export const defaultPushTokenReporter: PushTokenReporter = async (token) => {
	await apiClient.post({
		url: "/api/v1/user/push-token",
		data: { token, platform: inMobile() ? "mobile" : "web" },
		silentError: true,
	});
};

setPushTokenReporter(defaultPushTokenReporter);

export async function reportPushToken(token: string): Promise<void> {
	if (!reporter) {
		console.info("[push] token 上报未配置", token.slice(0, 6));
		return;
	}
	try {
		await reporter(token);
	} catch (err) {
		console.info("[push] token 上报失败", err);
	}
}
