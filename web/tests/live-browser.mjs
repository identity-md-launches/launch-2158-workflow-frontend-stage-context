import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { startServer } from "../scripts/serve.mjs";
const { server, url } = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (["error", "warning"].includes(m.type()))
    errors.push(m.type() + ": " + m.text());
});
page.on("response", (r) =>
  requests.push({
    method: r.request().method(),
    url: r.url(),
    status: r.status(),
  }),
);
const evidence = new URL("../../docs/frontend/evidence/", import.meta.url);
const report = {
  browser: browser.version(),
  mocked: false,
  viewports: [],
  colors: {},
  errors,
  requests,
};
try {
  await page.goto(url);
  await page
    .getByText("Deposits open", { exact: true })
    .waitFor({ timeout: 30000 });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    const metrics = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      block: document.querySelector(".read-status").textContent,
      fontLoaded: document.fonts.check("700 48px Pixelify"),
    }));
    if (metrics.viewport !== metrics.scroll)
      throw new Error("Horizontal overflow at " + width);
    const action = await page
      .getByRole("button", { name: "Deposit LOCKER", exact: true })
      .boundingBox();
    if (width === 390 && action.y + action.height > 844)
      throw new Error("Main action is below the first screen");
    report.viewports.push({ ...metrics, action });
    if (width === 390)
      await page.screenshot({
        path: new URL("disconnected-mobile-390.png", evidence).pathname,
      });
    if (width === 1440)
      await page.screenshot({
        path: new URL("live-desktop-1440.png", evidence).pathname,
      });
  }
  report.colors = await page
    .locator("input")
    .first()
    .evaluate((e) => ({
      border: getComputedStyle(e.parentElement).borderColor,
      background: getComputedStyle(e.parentElement).backgroundColor,
      token: getComputedStyle(document.documentElement)
        .getPropertyValue("--control-border")
        .trim(),
    }));
  if (errors.length) throw new Error("Browser errors: " + errors.join("; "));
  report.passed = true;
} finally {
  await writeFile(
    new URL("live-browser.json", evidence),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(
  JSON.stringify(
    {
      passed: report.passed,
      viewports: report.viewports,
      colors: report.colors,
      errors,
    },
    null,
    2,
  ),
);
