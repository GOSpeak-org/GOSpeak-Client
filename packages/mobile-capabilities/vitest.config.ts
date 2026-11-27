import { defineConfig } from "vitest/config";

export default defineConfig(() => {
	const target =
		process.env.GOSPEAK_TARGET === "mobile"
			? "mobile"
			: process.env.GOSPEAK_TARGET === "desktop"
				? "desktop"
				: "web";
	return {
		define: {
			__GOSPEAK_TARGET__: JSON.stringify(target),
			__GOSPEAK_DESKTOP__: String(target === "desktop"),
			__GOSPEAK_MOBILE__: String(target === "mobile"),
		},
		test: {
			environment: "node",
		},
	};
});
