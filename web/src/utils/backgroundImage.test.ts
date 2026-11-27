import { describe, expect, it } from "vitest";
import { calcTargetSize, compressImage, encodeCanvas } from "./backgroundImage";

describe("calcTargetSize", () => {
	it("keeps sizes within the max edge", () => {
		expect(calcTargetSize(4000, 2000)).toEqual({ width: 2560, height: 1280 });
		expect(calcTargetSize(1000, 3000)).toEqual({ width: 853, height: 2560 });
	});

	it("passes through smaller images unchanged", () => {
		expect(calcTargetSize(1920, 1080)).toEqual({ width: 1920, height: 1080 });
	});

	it("never produces a zero edge", () => {
		expect(calcTargetSize(999999, 1)).toEqual({ width: 2560, height: 1 });
	});
});

describe("compressImage", () => {
	it("rejects non-image input", async () => {
		const file = new Blob(["x"], { type: "text/plain" });
		await expect(compressImage(file)).rejects.toThrow("IMAGE_TYPE_UNSUPPORTED");
	});
});

describe("encodeCanvas", () => {
	it("prefers webp at the configured quality", async () => {
		const types: string[] = [];
		const fake = {
			toBlob: (cb: (b: Blob | null) => void, type: string) => {
				types.push(type);
				cb(new Blob(["w"], { type }));
			},
		};
		const blob = await encodeCanvas(fake as unknown as HTMLCanvasElement);
		expect(types).toEqual(["image/webp"]);
		expect(blob.type).toBe("image/webp");
	});

	it("falls back to JPEG when webp encoding is unsupported", async () => {
		const types: string[] = [];
		const fake = {
			toBlob: (cb: (b: Blob | null) => void, type: string) => {
				types.push(type);
				cb(type === "image/webp" ? null : new Blob(["j"], { type }));
			},
		};
		const blob = await encodeCanvas(fake as unknown as HTMLCanvasElement);
		expect(types).toEqual(["image/webp", "image/jpeg"]);
		expect(blob.type).toBe("image/jpeg");
	});

	it("throws when no encoder is available", async () => {
		const fake = { toBlob: (cb: (b: Blob | null) => void) => cb(null) };
		await expect(
			encodeCanvas(fake as unknown as HTMLCanvasElement),
		).rejects.toThrow("IMAGE_ENCODE_FAILED");
	});
});
