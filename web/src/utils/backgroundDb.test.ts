import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { deleteBackground, getBackground, putBackground } from "./backgroundDb";

describe("backgroundDb", () => {
	it("round-trips a single shared blob", async () => {
		expect(await getBackground()).toBeNull();
		await putBackground(new Blob(["abc"], { type: "image/webp" }));
		expect(await getBackground()).not.toBeNull();
		await deleteBackground();
		expect(await getBackground()).toBeNull();
	});

	it("migrates a legacy light blob into the shared key", async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const req = indexedDB.open("gospeak-web", 1);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		const tx = db.transaction("backgrounds", "readwrite");
		tx.objectStore("backgrounds").put(
			new Blob(["legacy"], { type: "image/webp" }),
			"light",
		);
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		db.close();
		expect(await getBackground()).not.toBeNull();
		await putBackground(new Blob(["new"], { type: "image/webp" }));
		expect(await getBackground()).not.toBeNull();
	});
});
