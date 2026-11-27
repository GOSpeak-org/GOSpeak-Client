/**
 * Build-target ambient tokens injected by the bundler via `define`.
 *
 * Keep in sync with `app/web/types/gospeak-build.d.ts` and
 * `packages/desktop/src/globals.d.ts`.
 */
declare const __GOSPEAK_TARGET__: "web" | "desktop" | "mobile";
declare const __GOSPEAK_DESKTOP__: boolean;
declare const __GOSPEAK_MOBILE__: boolean;
