import { createFileRoute } from "@tanstack/react-router";
import SettingsPage from "@/components/mobile/settingsPage";

export const Route = createFileRoute("/(app)/settings")({
	staticData: { title: "设置" },
	component: SettingsPage,
});
