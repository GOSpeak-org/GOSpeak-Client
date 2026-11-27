import { create } from "zustand";

const STORAGE_THEME_LIGHT = "theme-light";
const STORAGE_THEME_DARK = "theme-dark";
const STORAGE_DARK = "theme-is-dark";

export interface ThemeOption {
	name: string;
	label: string;
}

// 主题 token 定义在 packages/components/src/theme.css，按 data-theme 取值。
// 三组新增家族均为浅/深成对：aurora/midnight、ember/cinder、forest/grove。
// 卡片色块由自身 data-theme 自动预览，无需在 UI 里写死颜色。
export const lightThemes: ThemeOption[] = [
	{ name: "acid", label: "Acid" },
	{ name: "aurora", label: "Aurora" },
	{ name: "ember", label: "Ember" },
	{ name: "forest", label: "Forest" },
];

export const darkThemes: ThemeOption[] = [
	{ name: "dark", label: "Dark" },
	{ name: "midnight", label: "Midnight" },
	{ name: "cinder", label: "Cinder" },
	{ name: "grove", label: "Grove" },
];

function getInitialDark(): boolean {
	const saved = localStorage.getItem(STORAGE_DARK);
	if (saved !== null) return saved === "true";
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getStoredTheme(key: string, fallback: string): string {
	return localStorage.getItem(key) || fallback;
}

const initialDark = getInitialDark();
const initialLightTheme = getStoredTheme(STORAGE_THEME_LIGHT, "acid");
const initialDarkTheme = getStoredTheme(STORAGE_THEME_DARK, "dark");
const initialTheme = initialDark ? initialDarkTheme : initialLightTheme;

interface ThemeState {
	theme: string;
	lightTheme: string;
	darkTheme: string;
	isDark: boolean;
}

export const useThemeStore = create<ThemeState>(() => ({
	theme: initialTheme,
	lightTheme: initialLightTheme,
	darkTheme: initialDarkTheme,
	isDark: initialDark,
}));

function applyTheme() {
	const { theme, isDark } = useThemeStore.getState();
	document.documentElement.setAttribute("data-theme", theme);
	document.documentElement.classList.toggle("dark", isDark);
}

function switchLightTheme(name: string) {
	const { isDark } = useThemeStore.getState();
	localStorage.setItem(STORAGE_THEME_LIGHT, name);
	useThemeStore.setState({ lightTheme: name });
	if (!isDark) {
		useThemeStore.setState({ theme: name });
		applyTheme();
	}
}

function switchDarkTheme(name: string) {
	const { isDark } = useThemeStore.getState();
	localStorage.setItem(STORAGE_THEME_DARK, name);
	useThemeStore.setState({ darkTheme: name });
	if (isDark) {
		useThemeStore.setState({ theme: name });
		applyTheme();
	}
}

function toggleDark() {
	const next = !useThemeStore.getState().isDark;
	const theme = next
		? useThemeStore.getState().darkTheme
		: useThemeStore.getState().lightTheme;
	useThemeStore.setState({ isDark: next, theme });
	localStorage.setItem(STORAGE_DARK, String(next));
	applyTheme();
}

function setDarkMode(enabled: boolean) {
	if (enabled === useThemeStore.getState().isDark) return;
	toggleDark();
}

function initTheme() {
	applyTheme();
}

export {
	initTheme,
	setDarkMode,
	switchDarkTheme,
	switchLightTheme,
	toggleDark,
};

export default useThemeStore;
