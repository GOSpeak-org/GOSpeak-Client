const DB_NAME = "gospeak-web";
const STORE_NAME = "backgrounds";
const DB_VERSION = 1;
const SHARED_KEY = "shared";
const LEGACY_KEYS = ["light", "dark"] as const;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error("INDEXEDDB_REQUEST_FAILED"));
	});
}

function transactionDone(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onabort = () => reject(tx.error ?? new Error("INDEXEDDB_ABORTED"));
		tx.onerror = () => reject(tx.error ?? new Error("INDEXEDDB_TX_FAILED"));
	});
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE_NAME)) {
				request.result.createObjectStore(STORE_NAME);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error("INDEXEDDB_OPEN_FAILED"));
	});
}

async function withDb<T>(run: (db: IDBDatabase) => Promise<T>): Promise<T> {
	const db = await openDb();
	try {
		return await run(db);
	} finally {
		db.close();
	}
}

export async function getBackground(): Promise<Blob | null> {
	return withDb(async (db) => {
		const store = db
			.transaction(STORE_NAME, "readonly")
			.objectStore(STORE_NAME);
		for (const key of [SHARED_KEY, ...LEGACY_KEYS]) {
			const result = await requestToPromise(
				store.get(key) as IDBRequest<Blob | undefined>,
			);
			if (result) return result;
		}
		return null;
	});
}

export async function putBackground(blob: Blob): Promise<void> {
	await withDb(async (db) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		store.put(blob, SHARED_KEY);
		for (const key of LEGACY_KEYS) store.delete(key);
		await transactionDone(tx);
	});
}

export async function deleteBackground(): Promise<void> {
	await withDb(async (db) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		store.delete(SHARED_KEY);
		for (const key of LEGACY_KEYS) store.delete(key);
		await transactionDone(tx);
	});
}
