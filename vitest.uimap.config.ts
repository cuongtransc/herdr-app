import browser from "./vitest.browser.config";

// `mise run docs:ui-map` only: renders the App to draw docs/design/ui-map.html. The browser
// config's own tests are left out (mergeConfig would add to its include, not replace it).
export default { ...browser, test: { ...browser.test, include: ["src/docs/*.capture.tsx"] } };
