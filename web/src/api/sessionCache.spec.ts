import { beforeEach, describe, expect, it } from "vitest";
import {
	SESSION_EXPIRES_KEY,
	USER_STORAGE_KEY,
	clearSessionCache,
} from "./sessionCache";

describe("clearSessionCache", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("clears both the cached user and the session expiry", () => {
		localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ id: 1 }));
		localStorage.setItem(SESSION_EXPIRES_KEY, "123456");

		clearSessionCache();

		expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
		expect(localStorage.getItem(SESSION_EXPIRES_KEY)).toBeNull();
	});

	it("is safe to call when there is nothing cached", () => {
		expect(() => clearSessionCache()).not.toThrow();
	});
});
