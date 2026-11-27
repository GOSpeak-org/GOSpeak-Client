/**
 * Build-target ambient tokens, injected by the bundler via `define`.
 *
 * - `__GOSPEAK_TARGET__`: `"web" | "desktop" | "mobile"` — the build target.
 * - `__GOSPEAK_DESKTOP__`: `boolean` literal — sugar for target === "desktop".
 * - `__GOSPEAK_MOBILE__`: `boolean` literal — sugar for target === "mobile".
 *
 * See `conditional.ts` for the public toolkit and `packages/desktop/README.md`
 * for usage patterns. Keep this file in sync with
 * `app/web/types/gospeak-build.d.ts` (the web app's copy for its own program).
 */
declare const __GOSPEAK_TARGET__: "web" | "desktop" | "mobile";
declare const __GOSPEAK_DESKTOP__: boolean;
declare const __GOSPEAK_MOBILE__: boolean;
