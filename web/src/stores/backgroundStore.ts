import { create } from "zustand";
import {
	deleteBackground,
	getBackground,
	putBackground,
} from "@/utils/backgroundDb";
import { compressImage } from "@/utils/backgroundImage";
import { toastActionError } from "@/utils/toast";

const STORAGE_GLASS = "background-glass";
const LEGACY_GLASS_LIGHT = "background-glass-light";
const LEGACY_GLASS_DARK = "background-glass-dark";
const LEGACY_TIER_LIGHT = "background-tier-light";
const LEGACY_TIER_DARK = "background-tier-dark";

export type BackgroundTier = "subtle" | "balanced" | "immersive";

export interface GlassSettings {
	strength: number;
	opacity: number;
}

export const backgroundPresets: {
	value: BackgroundTier;
	label: string;
	glass: GlassSettings;
}[] = [
	{ value: "subtle", label: "轻透", glass: { strength: 25, opacity: 85 } },
	{ value: "balanced", label: "均衡", glass: { strength: 58, opacity: 68 } },
	{ value: "immersive", label: "沉浸", glass: { strength: 83, opacity: 40 } },
];

const DEFAULT_GLASS: GlassSettings = { strength: 58, opacity: 68 };

function clamp(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(100, Math.max(0, Math.round(value)));
}

function parseGlass(value: string | null): GlassSettings | null {
	if (!value) return null;
	let parsed: Partial<GlassSettings> | null = null;
	try {
		parsed = JSON.parse(value) as Partial<GlassSettings>;
	} catch {
		parsed = null;
	}
	if (
		parsed &&
		typeof parsed.strength === "number" &&
		typeof parsed.opacity === "number"
	) {
		return {
			strength: clamp(parsed.strength),
			opacity: clamp(parsed.opacity),
		};
	}
	return null;
}

function storedGlass(): GlassSettings {
	const current = parseGlass(localStorage.getItem(STORAGE_GLASS));
	if (current) return current;
	for (const key of [LEGACY_GLASS_LIGHT, LEGACY_GLASS_DARK]) {
		const legacy = parseGlass(localStorage.getItem(key));
		if (legacy) return legacy;
	}
	for (const key of [LEGACY_TIER_LIGHT, LEGACY_TIER_DARK]) {
		const preset = backgroundPresets.find(
			(item) => item.value === localStorage.getItem(key),
		);
		if (preset) return { ...preset.glass };
	}
	return { ...DEFAULT_GLASS };
}

export function activePreset(glass: GlassSettings): BackgroundTier | "custom" {
	const match = backgroundPresets.find(
		(item) =>
			item.glass.strength === glass.strength &&
			item.glass.opacity === glass.opacity,
	);
	return match ? match.value : "custom";
}

export function glassBlurPx(strength: number): number {
	return Math.round((clamp(strength) * 24) / 100 / 0.5) * 0.5;
}

export function glassSaturate(strength: number): number {
	return Math.round((1 + (clamp(strength) / 100) * 0.36) * 100) / 100;
}

function mutedAlpha(opacity: number): number {
	return Math.round(clamp(opacity) * 0.75);
}

interface BackgroundState {
	glass: GlassSettings;
	hasImage: boolean;
	activeUrl: string | null;
	available: boolean;
}

export const useBackgroundStore = create<BackgroundState>(() => ({
	glass: storedGlass(),
	hasImage: false,
	activeUrl: null,
	available: true,
}));

function clearBackgroundDom(): void {
	const html = document.documentElement;
	html.classList.remove("bg-custom");
	html.style.removeProperty("--bg-blur");
	html.style.removeProperty("--bg-card-alpha");
	html.style.removeProperty("--bg-muted-alpha");
	html.style.removeProperty("--bg-saturate");
	const body = document.body.style;
	body.backgroundImage = "";
	body.backgroundSize = "";
	body.backgroundPosition = "";
	body.backgroundRepeat = "";
	body.backgroundAttachment = "";
}

function applyBackground(): void {
	const { activeUrl, glass } = useBackgroundStore.getState();
	const html = document.documentElement;
	const body = document.body.style;
	if (!activeUrl) {
		clearBackgroundDom();
		return;
	}
	html.classList.add("bg-custom");
	html.style.setProperty("--bg-blur", `${glassBlurPx(glass.strength)}px`);
	html.style.setProperty("--bg-card-alpha", `${glass.opacity}%`);
	html.style.setProperty("--bg-muted-alpha", `${mutedAlpha(glass.opacity)}%`);
	html.style.setProperty(
		"--bg-saturate",
		String(glassSaturate(glass.strength)),
	);
	body.backgroundImage = `url("${activeUrl}")`;
	body.backgroundSize = "cover";
	body.backgroundPosition = "center";
	body.backgroundRepeat = "no-repeat";
	body.backgroundAttachment = "fixed";
}

function setActiveBlob(blob: Blob | null): void {
	const { activeUrl } = useBackgroundStore.getState();
	if (activeUrl) URL.revokeObjectURL(activeUrl);
	useBackgroundStore.setState({
		activeUrl: blob ? URL.createObjectURL(blob) : null,
	});
	applyBackground();
}

async function refreshActiveBlob(): Promise<void> {
	if (!useBackgroundStore.getState().available) return;
	try {
		setActiveBlob(await getBackground());
	} catch {
		useBackgroundStore.setState({ activeUrl: null, available: false });
		clearBackgroundDom();
	}
}

let initialized = false;

export const initBackground = async (): Promise<void> => {
	if (initialized) return;
	initialized = true;
	if (typeof indexedDB === "undefined") {
		useBackgroundStore.setState({ available: false });
		return;
	}
	try {
		const image = await getBackground();
		useBackgroundStore.setState({ hasImage: image !== null });
	} catch {
		useBackgroundStore.setState({ available: false });
		return;
	}
	await refreshActiveBlob();
};

const setImage = async (file: File): Promise<void> => {
	if (!useBackgroundStore.getState().available) {
		toastActionError(
			new Error("INDEXEDDB_UNAVAILABLE"),
			"当前环境不支持背景图",
		);
		return;
	}
	if (!file.type.startsWith("image/")) {
		toastActionError(new Error("IMAGE_TYPE_UNSUPPORTED"), "仅支持图片文件");
		return;
	}
	try {
		const blob = await compressImage(file);
		await putBackground(blob);
		useBackgroundStore.setState({ hasImage: true });
		await refreshActiveBlob();
	} catch (error) {
		toastActionError(error, "背景图保存失败，请重试");
	}
};

const removeImage = async (): Promise<void> => {
	try {
		await deleteBackground();
		useBackgroundStore.setState({ hasImage: false });
		await refreshActiveBlob();
	} catch (error) {
		toastActionError(error, "背景图删除失败，请重试");
	}
};

const setGlass = (patch: Partial<GlassSettings>): void => {
	const current = useBackgroundStore.getState().glass;
	const next: GlassSettings = {
		strength:
			patch.strength === undefined ? current.strength : clamp(patch.strength),
		opacity:
			patch.opacity === undefined ? current.opacity : clamp(patch.opacity),
	};
	localStorage.setItem(STORAGE_GLASS, JSON.stringify(next));
	useBackgroundStore.setState({ glass: next });
	applyBackground();
};

const applyPreset = (tier: BackgroundTier): void => {
	const preset = backgroundPresets.find((item) => item.value === tier);
	if (preset) setGlass(preset.glass);
};

export const backgroundStore = {
	get state() {
		return useBackgroundStore.getState();
	},
	init: initBackground,
	setImage,
	removeImage,
	setGlass,
	applyPreset,
};

export function createBackgroundStore() {
	initialized = false;
	const { activeUrl } = useBackgroundStore.getState();
	if (activeUrl) URL.revokeObjectURL(activeUrl);
	clearBackgroundDom();
	useBackgroundStore.setState({
		glass: storedGlass(),
		hasImage: false,
		activeUrl: null,
		available: true,
	});
	return backgroundStore;
}

export default backgroundStore;
