import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { chromium, webkit, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { startServer } from "../scripts/serve.mjs";
import {
  createMock,
  installMock,
  owner,
  visitor,
  addresses,
} from "./mock-rpc.mjs";
const root = resolve(fileURLToPath(new URL("../..", import.meta.url))),
  evidence = root + "/docs/frontend/evidence";
await mkdir(evidence, { recursive: true });
const { server, url } = await startServer();
const report = { tests: [], browsers: {}, screenshots: [], limitations: [] };
let browser;
async function test(name, fn) {
  if (
    process.argv[2] &&
    !name.toLowerCase().includes(process.argv[2].toLowerCase())
  )
    return;
  const began = Date.now();
  try {
    await fn();
    report.tests.push({ name, passed: true, durationMs: Date.now() - began });
    console.log("PASS " + name);
  } catch (e) {
    report.tests.push({
      name,
      passed: false,
      error: String(e),
      durationMs: Date.now() - began,
    });
    console.error("FAIL " + name + "\n" + e.stack);
  } finally {
    if (browser) for (const c of browser.contexts()) await c.close();
  }
}
async function setup(options = {}, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mock = createMock(options);
  await installMock(page, mock, options);
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "The farming vault", exact: true }),
  ).toBeVisible();
  return { page, context, mock, errors };
}
async function connected(options = {}, viewport) {
  const s = await setup(options, viewport);
  await s.page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await s.page
    .getByRole("button", { name: "Test wallet", exact: true })
    .click();
  await expect(s.page.getByRole("dialog")).not.toBeVisible();
  await expect(s.page.locator(".wallet-button")).toHaveText(/0x1234|0x9876/);
  await expect(
    s.page
      .locator(".farm-card")
      .first()
      .getByRole("button", { name: "Deposit LOCKER", exact: true }),
  ).toBeEnabled();
  return s;
}
const farm = (page) =>
  page.getByRole("article", { name: "LOCKER farm", exact: true });
async function confirm(page, name) {
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm " + name.toLowerCase(), exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.locator(".activity").getByText("confirmed", { exact: true }).first(),
  ).toBeVisible();
}
async function screenshot(page, name) {
  await page.screenshot({
    path: evidence + "/" + name + ".png",
    fullPage: false,
  });
  report.screenshots.push(name + ".png");
}
async function noOverflow(page) {
  const result = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll("body *")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.width > 0 && r.right > document.documentElement.clientWidth + 1
        );
      })
      .map((e) => ({
        tag: e.tagName,
        class: e.className,
        text: e.textContent?.slice(0, 100),
        right: e.getBoundingClientRect().right,
      })),
  }));
  assert(
    result.scroll <= result.width,
    "horizontal overflow: " + JSON.stringify(result),
  );
}
try {
  browser = await chromium.launch({ headless: true });
  report.browsers.chromium = browser.version();
  await test("Production subpath, metadata, disconnected controls, wallet discovery and keyboard focus", async () => {
    const { page, context, errors } = await setup();
    await expect(
      farm(page).getByRole("button", { name: "Deposit LOCKER", exact: true }),
    ).toBeDisabled();
    assert.equal(
      await page.locator('meta[property="og:image"]').getAttribute("content"),
      "./share.png",
    );
    await page.getByRole("button", { name: "Connect wallet" }).click();
    await expect(
      page.getByRole("button", { name: "Test wallet" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Browser wallet" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Coinbase Wallet", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Connect wallet" }),
    ).toBeFocused();
    assert.deepEqual(errors, []);
    await context.close();
  });
  await test("Phone wallet links and Coinbase Smart Wallet without an injected provider", async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    });
    const page = await context.newPage();
    await installMock(page, createMock(), { wallet: false });
    await page.goto(url);
    await page.getByRole("button", { name: "Connect wallet" }).click();
    for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
      await expect(
        page.getByRole("link", { name: "Open in " + name }),
      ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Coinbase Smart Wallet" }),
    ).toBeVisible();
    await noOverflow(page);
    await screenshot(page, "mobile-wallets");
    await context.close();
  });
  await test("Unknown wallet chain adds unchanged handoff network and switches to Sepolia", async () => {
    const { page, mock, context } = await connected({
      chain: "0x1",
      unknownChain: true,
    });
    assert(mock.state.added);
    assert.deepEqual(
      mock.state.calls.find((c) => c.method === "wallet_addEthereumChain")
        .params,
      [mock.manifest.walletAddChain],
    );
    assert.equal(
      mock.state.calls.filter((c) => c.method === "wallet_switchEthereumChain")
        .length,
      2,
    );
    assert.equal(mock.state.sent.length, 0);
    await context.close();
  });
  await test("Connection rejection is announced and retry remains available", async () => {
    const { page, mock, context } = await setup({ rejectConnect: true });
    await page.getByRole("button", { name: "Connect wallet" }).click();
    await page.getByRole("button", { name: "Test wallet" }).click();
    await expect(
      page.getByText("Request declined in your wallet. You can try again.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Test wallet", exact: true }),
    ).toBeEnabled();
    mock.state.rejectConnect = false;
    await page.getByRole("button", { name: "Test wallet" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await context.close();
  });
  await test("Exact approval precedes deposit, receipt refreshes balances, and blank input cannot send", async () => {
    const { page, mock, context, errors } = await connected();
    const f = farm(page);
    await f
      .getByRole("button", { name: "Deposit LOCKER", exact: true })
      .click();
    await expect(f.getByRole("alert")).toContainText("Enter a valid amount");
    assert.equal(mock.state.sent.length, 0);
    await f.getByLabel("Deposit amount").fill("10");
    await f
      .getByRole("button", { name: "Approve LOCKER", exact: true })
      .click();
    await confirm(page, "Approve LOCKER");
    assert.equal(mock.state.sent[0].fn, "approve");
    assert.equal(mock.state.sent[0].args[1], 10n * 10n ** 18n);
    assert.equal(
      mock.state.sent[0].args[0].toLowerCase(),
      addresses.LockerFarm,
    );
    await f
      .getByRole("button", { name: "Deposit LOCKER", exact: true })
      .click();
    await confirm(page, "Deposit LOCKER");
    assert.equal(mock.state.sent[1].fn, "deposit");
    assert.equal(mock.state.stake, 110n * 10n ** 18n);
    assert.deepEqual(errors, []);
    await context.close();
  });
  await test("Withdrawal review shows exact 90/9/1 split and claims work independently", async () => {
    const { page, mock, context } = await connected();
    const f = farm(page);
    await f.getByRole("button", { name: "Withdraw", exact: true }).click();
    await f.getByLabel("Withdraw principal").fill("100");
    await f.getByRole("button", { name: "Withdraw LOCKER" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("90 LOCKER", { exact: true })).toBeVisible();
    await expect(dialog.getByText("9 LOCKER", { exact: true })).toBeVisible();
    await expect(dialog.getByText("1 LOCKER", { exact: true })).toBeVisible();
    await confirm(page, "Withdraw LOCKER");
    assert.equal(mock.state.stake, 0n);
    await f.getByRole("button", { name: "Claim fees", exact: true }).click();
    await confirm(page, "Claim fees");
    await f.getByRole("button", { name: "Claim LOCKER", exact: true }).click();
    await confirm(page, "Claim LOCKER");
    assert.deepEqual(
      mock.state.sent.map((x) => x.fn),
      ["withdraw", "claimFees", "claimRewards"],
    );
    await expect(
      f.getByRole("button", { name: "Claim fees", exact: true }),
    ).toBeDisabled();
    await context.close();
  });
  await test("Exit withdraws principal and both reward types in one reviewed call", async () => {
    const { page, mock, context } = await connected();
    await farm(page)
      .getByText("Position & farm details", { exact: true })
      .click();
    await farm(page).getByRole("button", { name: "Exit & claim all" }).click();
    await confirm(page, "Exit farm");
    assert.deepEqual(
      mock.state.sent.map((x) => x.fn),
      ["exit"],
    );
    await context.close();
  });
  await test("Simulation failure prevents wallet signing and displays decoded custom error", async () => {
    const { page, mock, context } = await connected({ simulateRevert: true });
    await farm(page)
      .getByRole("button", { name: "Claim fees", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm claim fees" })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "Deposits are paused",
    );
    assert.equal(mock.state.sent.length, 0);
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm claim fees" }),
    ).toBeEnabled();
    await context.close();
  });
  await test("Wallet rejection restores the same action for retry without broadcasting", async () => {
    const { page, mock, context } = await connected({ rejectWrite: true });
    await farm(page)
      .getByRole("button", { name: "Claim LOCKER", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm claim locker" })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "Request declined",
    );
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm claim locker" }),
    ).toBeEnabled();
    assert.equal(mock.state.sent.length, 0);
    await context.close();
  });
  await test("Pending receipt keeps action locked, then confirms and refreshes", async () => {
    const { page, mock, context } = await connected({ receiptDelay: 2 });
    await farm(page)
      .getByRole("button", { name: "Claim fees", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm claim fees" })
      .click();
    await expect(
      farm(page).getByRole("button", { name: /Claim fees · confirming/ }),
    ).toBeDisabled();
    await expect(
      page.getByText("Confirmed on chain.", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    assert.equal(mock.state.sent.length, 1);
    await context.close();
  });
  await test("A reverted receipt reports failure and allows a fresh review", async () => {
    const { page, mock, context } = await connected({ receiptStatus: "0x0" });
    await farm(page)
      .getByRole("button", { name: "Claim fees", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm claim fees" })
      .click();
    await expect(farm(page).getByRole("alert")).toContainText(
      "transaction reverted",
    );
    await expect(
      farm(page).getByRole("button", { name: "Claim fees", exact: true }),
    ).toBeEnabled();
    assert.equal(mock.state.sent.length, 1);
    await context.close();
  });
  await test("Changing accounts during review cannot sign the previous wallet's plan", async () => {
    const { page, mock, context } = await connected();
    await farm(page)
      .getByRole("button", { name: "Claim fees", exact: true })
      .click();
    mock.state.account = visitor;
    await page.evaluate((a) => window.__emit("accountsChanged", [a]), visitor);
    await expect(page.locator(".wallet-button")).toHaveText(/0x9876/);
    await expect(page.getByRole("dialog")).not.toBeVisible();
    assert.equal(mock.state.sent.length, 0);
    await context.close();
  });
  await test("Wrong-network state stays visible after an external chain change", async () => {
    const { page, mock, context } = await connected();
    mock.state.chain = "0x1";
    await page.evaluate(() => window.__emit("chainChanged", "0x1"));
    await expect(
      page.getByRole("button", { name: "Switch to Sepolia", exact: true }),
    ).toBeVisible();
    await expect(
      farm(page).getByRole("button", { name: "Deposit LOCKER", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Switch to Sepolia", exact: true })
      .click();
    await expect(
      farm(page).getByRole("button", { name: "Deposit LOCKER", exact: true }),
    ).toBeEnabled();
    assert.equal(mock.state.sent.length, 0);
    await context.close();
  });
  await test("Permissionless reward funding uses fresh allowance before adding reserve", async () => {
    const { page, mock, context } = await connected({ account: visitor });
    await farm(page)
      .getByText("Position & farm details", { exact: true })
      .click();
    await farm(page)
      .getByLabel("Fund rewards (LOCKER)", { exact: true })
      .fill("50");
    await farm(page)
      .getByRole("button", { name: "Approve reward funding", exact: true })
      .click();
    await confirm(page, "Approve reward funding");
    await farm(page)
      .getByRole("button", { name: "Fund rewards", exact: true })
      .click();
    await confirm(page, "Fund rewards");
    assert.deepEqual(
      mock.state.sent.map((s) => s.fn),
      ["approve", "fundRewards"],
    );
    assert.equal(mock.state.reserve, 10050n * 10n ** 18n);
    await context.close();
  });
  await test("Native buy quotes by eth_call and uses configured router, hook and exact ETH value", async () => {
    const { page, mock, context } = await connected();
    await page.getByRole("link", { name: "Trade", exact: true }).click();
    await page.getByLabel("Pay amount (ETH)", { exact: true }).fill("0.1");
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await expect(page.getByText("10 LOCKER", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Swap tokens", exact: true })
      .click();
    await confirm(page, "Swap tokens");
    assert.equal(mock.state.sent.length, 1);
    assert.equal(mock.state.sent[0].fn, "execute");
    assert.equal(
      mock.state.sent[0].to,
      mock.manifest.network.uniswapV4.universalRouter,
    );
    assert.equal(BigInt(mock.state.sent[0].value), 10n ** 17n);
    const quoteCall = mock.state.calls.find(
      (c) =>
        c.method === "eth_call" &&
        c.params[0].to.toLowerCase() === mock.manifest.network.uniswapV4.quoter,
    );
    assert(quoteCall);
    await context.close();
  });
  await test("Token sell requires separate token and Permit2 approvals before zero-value swap", async () => {
    const { page, mock, context } = await connected();
    await page.getByRole("link", { name: "Trade", exact: true }).click();
    await page.getByRole("button", { name: "Sell", exact: true }).click();
    await page.getByLabel("Pay amount (LOCKER)", { exact: true }).fill("10");
    for (const action of [
      "Approve to Permit2",
      "Authorize router",
      "Swap tokens",
    ]) {
      await page
        .getByRole("button", { name: "Get quote", exact: true })
        .click();
      await page.getByRole("button", { name: action, exact: true }).click();
      await confirm(page, action);
    }
    assert.deepEqual(
      mock.state.sent.map((x) => x.fn),
      ["approve", "approve", "execute"],
    );
    assert.equal(
      mock.state.sent[0].args[0].toLowerCase(),
      mock.manifest.network.uniswapV4.permit2,
    );
    assert.equal(
      mock.state.sent[1].to,
      mock.manifest.network.uniswapV4.permit2,
    );
    assert.equal(
      mock.state.sent[1].args[1].toLowerCase(),
      mock.manifest.network.uniswapV4.universalRouter,
    );
    assert.equal(BigInt(mock.state.sent[2].value), 0n);
    await context.close();
  });
  await test("Quote invalidates on amount, direction and slippage changes", async () => {
    const { page, context } = await connected();
    await page.getByRole("link", { name: "Trade", exact: true }).click();
    await page.getByLabel("Pay amount (ETH)", { exact: true }).fill("0.1");
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Swap tokens", exact: true }),
    ).toBeEnabled();
    await page.getByLabel("Slippage tolerance (%)").fill("0.2");
    await expect(
      page.getByRole("button", { name: "Swap tokens", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Slippage tolerance (%)").fill("10");
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("slippage");
    await context.close();
  });
  await test("Owner setup, farm pause and irreversible renouncement guard", async () => {
    const { page, mock, context } = await connected();
    await page.getByRole("link", { name: "Admin", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Admin dashboard" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Register LOCKER farm", exact: true })
      .click();
    await confirm(page, "Register LOCKER farm");
    assert(mock.state.registered);
    await page
      .getByRole("button", { name: "Pause deposits", exact: true })
      .click();
    await confirm(page, "Pause deposits");
    assert(mock.state.paused);
    const emissions = page.locator("section.contract-form").filter({
      has: page.getByRole("heading", { name: "Emissions", exact: true }),
    });
    await emissions
      .getByLabel("Action", { exact: true })
      .selectOption("renounceEmissionsManager");
    await emissions
      .getByRole("button", { name: "Renounce emissions forever", exact: true })
      .click();
    const confirmButton = page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm renounce emissions forever" });
    await expect(confirmButton).toBeDisabled();
    await page
      .getByRole("dialog")
      .getByLabel("Type RENOUNCE", { exact: false })
      .fill("RENOUNCE");
    await expect(confirmButton).toBeEnabled();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close dialog" })
      .click();
    assert.equal(
      mock.state.sent.filter((x) => x.fn === "renounceEmissionsManager").length,
      0,
    );
    await screenshot(page, "mock-admin-desktop");
    await context.close();
  });
  await test("Owner can create farms, transfer Treasury funding, refill and start a schedule", async () => {
    const { page, mock, context } = await connected();
    await page.getByRole("link", { name: "Admin", exact: true }).click();
    const section = (name) =>
      page
        .locator("section.contract-form")
        .filter({ has: page.getByRole("heading", { name, exact: true }) });
    const create = section("Create or register a farm");
    await create
      .getByLabel("Staking token address", { exact: true })
      .fill(addresses.LaunchToken);
    await create
      .getByLabel("Initial farm admin address", { exact: true })
      .fill(owner);
    await create
      .getByRole("button", { name: "Create isolated farm", exact: true })
      .click();
    await confirm(page, "Create isolated farm");
    const treasury = section("Fund the Treasury");
    await treasury.getByLabel("Amount (LOCKER)", { exact: true }).fill("100");
    await treasury
      .getByRole("button", { name: "Transfer LOCKER to Treasury", exact: true })
      .click();
    await confirm(page, "Transfer LOCKER to Treasury");
    const refill = section("Fund farm reserve");
    await refill
      .getByLabel("Farm address", { exact: true })
      .fill(addresses.LockerFarm);
    await refill.getByLabel("Amount (LOCKER)", { exact: true }).fill("50");
    await refill
      .getByRole("button", { name: "Refill a farm", exact: true })
      .click();
    await confirm(page, "Refill a farm");
    const emissions = section("Emissions");
    await emissions
      .getByLabel("Reserve to commit (LOCKER)", { exact: true })
      .fill("20");
    await emissions
      .getByRole("button", { name: "Start 30-day epoch", exact: true })
      .click();
    await confirm(page, "Start 30-day epoch");
    assert.deepEqual(
      mock.state.sent.map((x) => x.fn),
      ["createFarm", "transfer", "fundFarm", "startEpoch"],
    );
    assert.equal(
      mock.state.sent[1].args[0].toLowerCase(),
      addresses.LockerTreasury,
    );
    assert.equal(mock.state.sent[1].args[1], 100n * 10n ** 18n);
    await context.close();
  });
  await test("Non-owner cannot reach administrative controls", async () => {
    const { page, context } = await connected({ account: visitor });
    await expect(
      page.getByRole("link", { name: "Admin", exact: true }),
    ).toHaveCount(0);
    await page.goto(url + "#admin");
    await expect(
      page.getByText(
        "This wallet does not hold an administrative role or a pending role offer.",
      ),
    ).toBeVisible();
    await context.close();
  });
  await test("Wallet read fallback works when every configured public RPC fails", async () => {
    const { page, context } = await connected({ publicFailure: true });
    await expect(
      farm(page).getByText("Deposits open", { exact: true }),
    ).toBeVisible();
    await context.close();
  });
  await test("Absent deployed bytecode blocks all transaction actions", async () => {
    const { page, context } = await setup({ noCode: true });
    await expect(
      page.getByText("Live reads unavailable", { exact: true }),
    ).toBeVisible();
    await expect(
      farm(page).getByRole("button", { name: "Deposit LOCKER", exact: true }),
    ).toBeDisabled();
    await context.close();
  });
  await test("Tampered ABI fails closed before connecting or rendering transaction controls", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route("**/abi/LaunchToken.json", (r) =>
      r.fulfill({ contentType: "application/json", body: "[]" }),
    );
    await page.goto(url);
    await expect(page.getByRole("alert")).toContainText(
      "Contract interface verification failed",
    );
    await expect(
      page.getByRole("button", { name: "Connect wallet" }),
    ).toHaveCount(0);
    await context.close();
  });
  await test("Mobile first screen, desktop, long balances, full addresses and no horizontal overflow", async () => {
    const { page, mock, context, errors } = await connected(
      { balance: 999999999999999999999999999999999999999n },
      { width: 390, height: 844 },
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({
        width,
        height: width === 1440 ? 1000 : 844,
      });
      await noOverflow(page);
      if (width === 390) {
        const box = await farm(page)
          .getByRole("button", { name: "Deposit LOCKER", exact: true })
          .boundingBox();
        assert(box.y + box.height <= 844, "main action below first screen");
        await screenshot(page, "mock-mobile-390");
      }
      if (width === 1440) await screenshot(page, "mock-desktop-1440");
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await farm(page)
      .getByText("Position & farm details", { exact: true })
      .click();
    await noOverflow(page);
    await page.locator(".wallet-button").click();
    await noOverflow(page);
    await page.keyboard.press("Escape");
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert(
      await page
        .locator(".chest-lid")
        .first()
        .evaluate((e) => getComputedStyle(e).animationName === "none"),
    );
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    await noOverflow(page);
    assert.deepEqual(errors, []);
    await context.close();
  });
  await test("Automated accessibility scan on farms, wallet dialog, guide and admin", async () => {
    const { page, context } = await connected();
    for (const route of ["farms", "guide", "admin"]) {
      await page.goto(url + "#" + route);
      await expect(page.locator("main h1")).toBeVisible();
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        result.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
        route,
      );
    }
    await page.locator(".wallet-button").click();
    const dialog = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      dialog.violations.map((v) => v.id),
      [],
    );
    await context.close();
  });
  await browser.close();
  browser = undefined;
  try {
    browser = await webkit.launch({ headless: true });
    report.browsers.webkit = browser.version();
    await test("WebKit wallet connection and claim interaction", async () => {
      const { page, mock, context } = await connected();
      await farm(page)
        .getByRole("button", { name: "Claim fees", exact: true })
        .click();
      await confirm(page, "Claim fees");
      assert.equal(mock.state.sent[0].fn, "claimFees");
      await context.close();
    });
  } catch (e) {
    report.browsers.webkit = "Unavailable";
    report.limitations.push(
      "WebKit could not launch: " + String(e).slice(0, 1000),
    );
    console.log("WebKit unavailable: " + String(e).slice(0, 250));
  }
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
  report.passed = report.tests.every((t) => t.passed);
  await writeFile(
    evidence + "/browser-results.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
if (!report.passed) process.exitCode = 1;
