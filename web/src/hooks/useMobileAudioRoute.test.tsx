import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMobileAudioRoute } from "./useMobileAudioRoute";

const m = vi.hoisted(() => ({
	list: vi.fn(async () => [
		{ kind: "speaker", label: "扬声器" },
		{ kind: "bluetooth", label: "蓝牙耳机" },
	]),
	current: vi.fn(() => "speaker" as const),
	set: vi.fn(async (_kind: string) => {}),
	refresh: vi.fn(async () => {}),
}));

vi.mock("@gospeak/mobile-capabilities", () => ({
	inMobile: () => true,
	createAudioRoute: () => ({
		list: m.list,
		current: m.current,
		set: m.set,
		refresh: m.refresh,
	}),
}));

describe("useMobileAudioRoute", () => {
	it("loads native routes on mount", async () => {
		const { result } = renderHook(() => useMobileAudioRoute());
		await waitFor(() => expect(result.current.options).toHaveLength(2));
		expect(result.current.options[1]?.label).toBe("蓝牙耳机");
		expect(result.current.current).toBe("speaker");
	});

	it("applies selection and reads back the current route", async () => {
		const { result } = renderHook(() => useMobileAudioRoute());
		await act(async () => {
			await result.current.select("bluetooth");
		});
		expect(m.set).toHaveBeenCalledWith("bluetooth");
		expect(m.refresh).toHaveBeenCalled();
		expect(result.current.current).toBe("speaker");
	});
});
