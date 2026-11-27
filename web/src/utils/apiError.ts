/** 从任意错误里提取后端 `Result.msg`，取不到时退回 Error.message / 兜底文案。 */
export function apiErrorMessage(error: unknown, fallback = "请求失败"): string {
	const response = (error as { response?: { data?: { msg?: string } } })
		?.response?.data?.msg;
	if (response) return response;
	if (error instanceof Error && error.message) return error.message;
	return fallback;
}

/** 后端业务码 + 文案，用于按 code 定制提示。 */
export function apiErrorCode(error: unknown): number | undefined {
	return (error as { response?: { data?: { code?: number } } })?.response?.data
		?.code;
}

/** 本地代理返回 6002：后端不可达，与普通 5xx 分开提示。 */
export function unreachableMessage(error: unknown): string | null {
	return apiErrorCode(error) === 6002
		? "无法连接到服务器，请检查地址或网络"
		: null;
}

/** 只取后端响应体里的 msg；不取 axios 自带的 "Request failed with status code 404" 等技术文案。 */
export function backendMessage(error: unknown): string {
	const msg = (error as { response?: { data?: { msg?: unknown } } })?.response
		?.data?.msg;
	return typeof msg === "string" && msg.trim() !== "" ? msg : "";
}
