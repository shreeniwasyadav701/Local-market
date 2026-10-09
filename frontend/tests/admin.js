/* Local Market — Module 15 admin dashboard smoke tests (Playwright).
   Run: node tests/admin.js   (server must be running on :5000) */
"use strict";

const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:5000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin-smoke@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "secret123";
const results = [];
let failures = 0;

const log = (s) => process.stdout.write(s + "\n");

const test = async (name, fn) => {
  const errs = [];
  try {
    await fn(errs);
    if (errs.length) throw new Error("console/page errors: " + errs.join(" | "));
    results.push(["PASS", name]);
    log("PASS  " + name);
  } catch (e) {
    failures++;
    results.push(["FAIL", name + " :: " + e.message]);
    log("FAIL  " + name + " :: " + e.message);
  }
};

const noOverflow = async (page) => {
  const { sw, iw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  if (sw > iw + 2) throw new Error("horizontal overflow: scrollWidth " + sw + " > innerWidth " + iw);
};

const newPage = async (browser, errs) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errs.push("[console] " + m.text()); });
  page.on("pageerror", (e) => errs.push("[pageerror] " + e.message));
  return page;
};

const goto = async (page, path) => {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
};

const loginAsAdmin = async (page) => {
  await goto(page, "/login.html");
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click("#submit-btn");
  await page.waitForTimeout(1500);
};

(async () => {
  const browser = await chromium.launch();

  /* ---------- 1. customer is redirected away from admin ---------- */
  await test("1 customer without admin role is redirected off admin.html", async (errs) => {
    const page = await newPage(browser, errs);
    // register a normal customer
    const email = "m15cust" + Date.now() + "@example.com";
    await goto(page, "/register.html");
    await page.fill('input[name="name"]', "M15 Customer");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="phone"]', "9876543210");
    await page.fill('input[name="password"]', "secret123");
    await page.click("#submit-btn");
    await page.waitForTimeout(1500);
    await goto(page, "/admin.html");
    await page.waitForTimeout(1200);
    const url = page.url();
    if (url.includes("admin.html")) throw new Error("customer still on admin page: " + url);
    await page.context().close();
  });

  /* ---------- 2. admin overview loads ---------- */
  await test("2 admin overview: stats, nav and recent orders render", async (errs) => {
    const page = await newPage(browser, errs);
    await loginAsAdmin(page);
    await goto(page, "/admin.html");
    await page.waitForSelector("#admin-nav-root .admin-nav", { timeout: 8000 });
    await page.waitForSelector(".stat-card .s-value", { timeout: 8000 });
    const navLinks = await page.locator(".admin-nav a").count();
    if (navLinks < 5) throw new Error("admin nav links missing: " + navLinks);
    await page.waitForSelector("#recent-orders tr", { timeout: 8000 });
    await noOverflow(page);
    await page.context().close();
  });

  /* ---------- 3. orders list ---------- */
  await test("3 admin orders: table and status filter render", async (errs) => {
    const page = await newPage(browser, errs);
    await loginAsAdmin(page);
    await goto(page, "/admin-orders.html");
    await page.waitForSelector("#orders-body tr", { timeout: 8000 });
    await page.selectOption("#status-filter", "delivered");
    await page.waitForTimeout(1200);
    const badges = await page.locator("#orders-body .badge").allTextContents();
    await noOverflow(page);
    await page.context().close();
  });

  /* ---------- 4. restaurants list ---------- */
  await test("4 admin restaurants: table renders", async (errs) => {
    const page = await newPage(browser, errs);
    await loginAsAdmin(page);
    await goto(page, "/admin-restaurants.html");
    await page.waitForSelector("#rest-body tr", { timeout: 8000 });
    const rows = await page.locator("#rest-body tr").count();
    if (rows < 1) throw new Error("no restaurant rows");
    await noOverflow(page);
    await page.context().close();
  });

  /* ---------- 5. foods list ---------- */
  await test("5 admin foods: table and filters render", async (errs) => {
    const page = await newPage(browser, errs);
    await loginAsAdmin(page);
    await goto(page, "/admin-foods.html");
    await page.waitForSelector("#foods-body tr", { timeout: 8000 });
    await page.waitForFunction(() => document.querySelectorAll("#restaurant-filter option").length > 1, null, { timeout: 8000 });
    const rows = await page.locator("#foods-body tr").count();
    if (rows < 1) throw new Error("no food rows");
    await noOverflow(page);
    await page.context().close();
  });

  /* ---------- 6. payments list ---------- */
  await test("6 admin payments: table renders", async (errs) => {
    const page = await newPage(browser, errs);
    await loginAsAdmin(page);
    await goto(page, "/admin-payments.html");
    await page.waitForSelector("#pay-body tr", { timeout: 8000 });
    await noOverflow(page);
    await page.context().close();
  });

  await browser.close();

  log("");
  log("========================================");
  log("ADMIN TOTAL: " + results.length + "  PASS: " + results.filter((r) => r[0] === "PASS").length + "  FAIL: " + failures);
  log("========================================");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  log("HARNESS ERROR: " + (e && e.stack ? e.stack : e));
  process.exit(2);
});
