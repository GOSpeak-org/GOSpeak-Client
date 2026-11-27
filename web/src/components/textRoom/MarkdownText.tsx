import { memo } from "react";
import { renderMarkdownCached } from "@/utils/markdownCache";

function MarkdownText({
	text,
	className,
	selfName,
}: {
	text: string;
	className?: string;
	selfName?: string;
}) {
	const html = renderMarkdownCached(text, selfName);
	return (
		<div
			className={`text-sm break-words [&_a]:text-primary [&_a]:underline [&_blockquote]:border-border [&_blockquote]:text-muted-foreground [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:bg-muted [&_code]:rounded-sm [&_code]:px-1 [&_code]:py-0.5 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border-border [&_img]:border [&_li]:ml-4 [&_ol]:list-decimal [&_pre]:bg-muted [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-2 [&_pre]:text-xs [&_pre]:leading-5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc ${className || ""}`}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: 内容经 DOMPurify 消毒
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

export default memo(MarkdownText);
