/** 私聊消息 DTO — 与后端 service.MessageDTO 对齐 */
export interface PrivateMessageDTO {
	uuid: string;
	author_id: string;
	author_name?: string;
	author_avatar?: string;
	content: string;
	reply_to?: string;
	edited_at?: string | null;
	deleted: boolean;
	created_at: string;
	conversation_id?: string;
	target_identity?: string;
	client_nonce?: string;
}
