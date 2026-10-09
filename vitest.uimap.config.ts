import { playwright } from "@vitest/browser-playwright";
import browser from "./vitest.browser.config";

// `mise run docs:ui-map` only: renders the App to draw docs/design/ui-map.html and the README's
// screenshots, at 2x like a Retina screen. The browser config's own tests are left out
// (mergeConfig would add to its include, not replace it).
export default {
  ...browser,
  // Pre-bundled up front: found mid-run, Vite re-optimizes and reloads the page, which loads a
  // second React and fails the first run on a fresh checkout.
  optimizeDeps: { include: ["@tauri-apps/plugin-dialog", "@tanstack/react-virtual", "@xterm/xterm", "@xterm/addon-fit"] },
  test: {
    ...browser.test,
    include: ["src/docs/*.capture.tsx"],
    browser: {
      ...browser.test!.browser,
      provider: playwright({ launchOptions: { channel: "chrome", ignoreDefaultArgs: ["--hide-scrollbars"] }, contextOptions: { deviceScaleFactor: 2 } }),
    },
  },
};
