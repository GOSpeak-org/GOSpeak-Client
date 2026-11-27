import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({
	gfm: true,
	breaks: true,
});

const MENTION_RE = /@([\w\u4e00-\u9fa5][\w\u4e00-\u9fa5.-]{0,23})/g;
const MAX_ENTRIES = 200;

function highlightMentions(html: string, selfName?: string): string {
	if (typeof window === "undefined" || typeof DOMParser === "undefined") {
		return html;
	}
	const doc = new DOMParser().parseFromString(
		`<div>${html}</div>`,
		"text/html",
	);
	const root = doc.body.firstElementChild;
	if (!root) return html;

	const walker = doc.createTreeWalker(root, Node.TEXT_NODE);
	const targets: Text[] = [];
	while (walker.nextNode()) {
		const node = walker.currentNode as Text;
		const parent = node.parentElement;
		if (!parent) continue;
		if (parent.closest("code, pre, a")) continue;
		if (!node.nodeValue?.includes("@")) continue;
		targets.push(node);
	}

	for (const node of targets) {
		const text = node.nodeValue ?? "";
		MENTION_RE.lastIndex = 0;
		if (!MENTION_RE.test(text)) continue;
		MENTION_RE.lastIndex = 0;

		const frag = doc.createDocumentFragment();
		let last = 0;
		for (const m of text.matchAll(MENTION_RE)) {
			const start = m.index ?? 0;
			if (start > last) {
				frag.append(doc.createTextNode(text.slice(last, start)));
			}
			const name = m[1];
			const span = doc.createElement("span");
			const isSelf = !!selfName && name === selfName;
			span.className = isSelf
				? "bg-primary/20 text-primary rounded-xs px-1 font-medium"
				: "bg-muted text-foreground rounded-xs px-1 font-medium";
			span.textContent = m[0];
			frag.append(span);
			last = start + m[0].length;
		}
		if (last < text.length) {
			frag.append(doc.createTextNode(text.slice(last)));
		}
		node.replaceWith(frag);
	}

	return root.innerHTML;
}

function renderUncached(text: string, selfName?: string): string {
	const raw = marked.parse(text || "", { async: false }) as string;
	const clean = DOMPurify.sanitize(raw);
	return highlightMentions(clean, selfName);
}

const cache = new Map<string, string>();

export function renderMarkdownCached(text: string, selfName?: string): string {
	const key = `${selfName ?? ""}\0${text}`;
	const hit = cache.get(key);
	if (hit !== undefined) {
		cache.delete(key);
		cache.set(key, hit);
		return hit;
	}
	const html = renderUncached(text, selfName);
	cache.set(key, html);
	if (cache.size > MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	return html;
}

export function clearMarkdownCache(): void {
	cache.clear();
}
