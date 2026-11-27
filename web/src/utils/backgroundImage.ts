export const BACKGROUND_MAX_EDGE = 2560;
export const BACKGROUND_QUALITY = 0.95;

export function calcTargetSize(
	width: number,
	height: number,
	maxEdge: number = BACKGROUND_MAX_EDGE,
): { width: number; height: number } {
	const longest = Math.max(width, height);
	if (longest <= maxEdge) return { width, height };
	const scale = maxEdge / longest;
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

async function decodeSource(
	file: Blob,
): Promise<{ source: CanvasImageSource; width: number; height: number }> {
	if (typeof createImageBitmap === "function") {
		const bitmap = await createImageBitmap(file);
		return { source: bitmap, width: bitmap.width, height: bitmap.height };
	}
	const url = URL.createObjectURL(file);
	try {
		const image = new Image();
		image.src = url;
		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve();
			image.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
		});
		return {
			source: image,
			width: image.naturalWidth,
			height: image.naturalHeight,
		};
	} finally {
		URL.revokeObjectURL(url);
	}
}

function canvasToBlob(
	canvas: HTMLCanvasElement,
	type: string,
	quality?: number,
): Promise<Blob | null> {
	return new Promise((resolve) => {
		canvas.toBlob((blob) => resolve(blob), type, quality);
	});
}

export async function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
	const webp = await canvasToBlob(canvas, "image/webp", BACKGROUND_QUALITY);
	if (webp) return webp;
	const jpeg = await canvasToBlob(canvas, "image/jpeg", BACKGROUND_QUALITY);
	if (jpeg) return jpeg;
	throw new Error("IMAGE_ENCODE_FAILED");
}

export async function compressImage(file: Blob): Promise<Blob> {
	if (!file.type.startsWith("image/")) {
		throw new Error("IMAGE_TYPE_UNSUPPORTED");
	}
	const { source, width, height } = await decodeSource(file);
	const target = calcTargetSize(width, height);
	const canvas = document.createElement("canvas");
	canvas.width = target.width;
	canvas.height = target.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
	ctx.drawImage(source, 0, 0, target.width, target.height);
	return encodeCanvas(canvas);
}
