import type { MessageDTO as WireMessageDTO } from "@/protocol/generated/payloads";

/**
 * S→C 消息 wire DTO：字段以 @/protocol/generated/payloads 为准，仅追加本地状态。
 * C→S 的 MessageSendPayload 不在此定义，避免把本地字段写进上行载荷。
 */
export type MessageDTO = WireMessageDTO & {
	/**
	 * 仅前端本地使用，不来自服务端：
	 * pending = 乐观插入、等 ack；failed = 发送失败，保留在列表里等用户重试。
	 */
	_status?: "pending" | "failed";
	_error?: string;
};

export type MessageListResult = {
	items: MessageDTO[];
	has_more: boolean;
	next_before: string;
};
