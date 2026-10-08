import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { doubleClick, drag, hover, key } from "./e2e/commands.ts";

// Real-browser tests (`*.browser.test.tsx`): the installed Chrome, real mouse and key events.
// Not part of `mise run ci`; run with `mise run test:browser`.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.browser.test.{ts,tsx}"],
    browser: {
      enabled: true,
      headless: true,
      // Scrollbars shown, as in the app: headless Chrome hides them, and they take width there.
      provider: playwright({ launchOptions: { channel: "chrome", ignoreDefaultArgs: ["--hide-scrollbars"] } }),
      instances: [{ browser: "chromium", viewport: { width: 1000, height: 600 } }],
      commands: { drag, doubleClick, hover, key },
    },
  },
});
