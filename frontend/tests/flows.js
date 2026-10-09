/* Local Market — Module 14 frontend flow tests (Playwright, plain Node runner)
   Run: node tests/flows.js   (server must be running on :5000) */
"use strict";

const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:5000";
const results = [];
let failures = 0;
let storageState = null;

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const newPage = async (browser, errs, opts) => {
  opts = opts || {};
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ...(opts.auth && storageState ? { storageState } : {}),
  });
  const page = await ctx.newPage();
  let benignPay404 = 0;
  page.on("response", (r) => {
    if (r.status() === 404 && r.url().includes("/api/payments/order/")) benignPay404++;
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // GET /api/payments/order/:id legitimately 404s before any payment exists
    // (Module 13 contract). The page handles it; the browser still logs it.
    if (benignPay404 > 0 && /Failed to load resource/.test(t) && /404/.test(t)) {
      benignPay404--;
      return;
    }
    errs.push("[console] " + t);
  });
  page.on("pageerror", (e) => errs.push("[pageerror] " + e.message));
  return page;
};

const goto = async (page, path) => {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
};

const noOverflow = async (page) => {
  const { sw, iw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  if (sw > iw + 2) throw new Error("horizontal overflow: scrollWidth " + sw + " > innerWidth " + iw);
};

const api = async (page, method, path, body) => {
  if (!page.url() || page.url() === "about:blank") {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  }
  return page.evaluate(
    async ([m, p, b]) => {
      const token = localStorage.getItem("lm_token") || "";
      const res = await fetch("/api" + p, {
        method: m,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: b ? JSON.stringify(b) : undefined,
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, data };
    },
    [method, path, body]
  );
};

(async () => {
  const browser = await chromium.launch();

  let email = "m14user" + Date.now() + "@example.com";
  const password = "secret123";
  let firstName = "Mira";
  let orderA = null;
  let orderB = null;
  let foodName = "";

  /* ---------- 1. home ---------- */
  await test("1 home page loads with hero, restaurants and foods", async (errs) => {
    const page = await newPage(browser, errs);
    await goto(page, "/");
    await page.waitForSelector(".hero h1", { timeout: 8000 });
    await page.waitForSelector("#restaurants-zone .grid-rest .card", { timeout: 10000 });
    await page.waitForSelector("#foods-zone .grid-food .card", { timeout: 10000 });
    const cats = await page.locator(".cat-card").count();
    if (cats < 5) throw new Error("category rail missing, got " + cats);
    foodName = (await page.locator("#foods-zone .card-title a").first().textContent()).trim();
    if (!foodName) throw new Error("no food names on home");
    await noOverflow(page);
    await page.context().close();
  });

  /* ---------- 2. restaurant discovery ---------- */
  await test("2 restaurant discovery: search + sort + cards", async (errs) => {
    const page = await newPage(browser, errs);
    await goto(page, "/restaurants.html");
    await page.waitForSelector("#restaurants-zone .grid-rest .card", { timeout: 10000 });
    const all = await page.locator("#restaurants-zone .card-title").count();
    if (all < 2) throw new Error("expected >=2 restaurants, got " + all);
    await page.fill("#rest-q", "curry");
    await page.waitForTimeout(900);
    const filtered = await page.locator("#restaurants-zone .card-title").allTextContents();
    if (!filtered.length) throw new Error("search for 'curry' returned nothing");
    if (!filtered.join(" ").toLowerCase().includes("curry")) {
      throw new Error("search results do not match: " + filtered.join(","));
    }
    await page.click("#rest-clear");
    await page.waitForTimeout(900);
    await page.selectOption("#rest-sort", "name_asc");
    await page.waitForTimeout(900);
    const sorted = (await page.locator("#restaurants-zone .card-title").allTextContents()).map((s) => s.trim());
    const again = [...sorted].sort((a, b) => a.localeCompare(b));
    if (JSON.stringify(sorted) !== JSON.stringify(again)) throw new Error("name_asc sort wrong: " + sorted);
    await noOverflow(page);
    await page.context().close();
  });

  /* ---------- 3. restaurant detail ---------- */
  await test("3 restaurant detail: hero, menu, category + veg filters", async (errs) => {
    const page = await newPage(browser, errs);
    await goto(page, "/restaurants.html");
    await page.waitForSelector("#restaurants-zone .card-title a");
    const href = await page.locator("#restaurants-zone .card-title a").first().getAttribute("href");
    await goto(page, "/" + href);
    await page.waitForSelector(".rest-hero-info h1", { timeout: 10000 });
    await page.waitForSelector("#foods-zone .grid-food .card", { timeout: 10000 });
    const menuCount = await page.locator("#foods-zone .card").count();
    if (menuCount < 1) throw new Error("menu empty");
    const chips = await page.locator("#menu-cats .chip").count();
    if (chips < 2) throw new Error("category chips missing");
    if (chips > 1) {
      await page.locator("#menu-cats .chip").nth(1).click();
      await page.waitForTimeout(300);
    }
    await page.locator("#menu-cats .chip").first().click();
    await page.check("#veg-only");
    await page.waitForTimeout(300);
    const vegMarks = await page.locator("#foods-zone .card .veg-mark.nonveg").count();
    if (vegMarks > 0) throw new Error("veg-only filter left " + vegMarks + " non-veg items");
    await page.uncheck("#veg-only");
    await noOverflow(page);
    await page.context().close();
  });

  /* ---------- 4. register ---------- */
  await test("4 register: creates account, session saved, navbar updates", async (errs) => {
    const page = await newPage(browser, errs);
    await goto(page, "/register.html");
    await page.fill("input[name=name]", firstName + " Tester");
    await page.fill("input[name=email]", email);
    await page.fill("input[name=phone]", "9876543210");
    await page.fill("input[name=password]", password);
    await page.click("#submit-btn");
    await page.waitForURL(/index\.html/, { timeout: 10000 });
    const token = await page.evaluate(() => localStorage.getItem("lm_token"));
    if (!token) throw new Error("no token after register");
    await page.waitForSelector("#profile-btn", { timeout: 5000 });
    const who = await page.evaluate(() => JSON.parse(localStorage.getItem("lm_user")).email);
    if (who !== email) throw new Error("session user wrong: " + who);
    storageState = await page.context().storageState();
    await noOverflow(page);
    await page.context().close();
  });

  /* ---------- 5. logout + login ---------- */
  await test("5 logout then login restores the session", async (errs) => {
    const page = await newPage(browser, errs, { auth: true });
    await goto(page, "/index.html");
    await page.waitForSelector("#profile-btn");
    await page.click("#profile-btn");
    await page.click("#profile-dd [data-logout]");
    await page.waitForURL(/index\.html/, { timeout: 8000 });
    await page.waitForSelector("a[href='login.html']", { timeout: 5000 });
    const token = await page.evaluate(() => localStorage.getItem("lm_token"));
    if (token) throw new Error("token still present after logout");

    await goto(page, "/login.html");
    await page.fill("input[name=email]", email);
    await page.fill("input[name=password]", password);
    await page.click("#submit-btn");
    await page.waitForURL(/index\.html/, { timeout: 10000 });
    await page.waitForSelector("#profile-btn", { timeout: 5000 });
    await page.context().close();
  });

  /* ---------- 6. unauthorized state ---------- */
  await test("6 unauthorized: logged-out user sees login prompt on protected pages", async (errs) => {
    const page = await newPage(browser, errs);
    await goto(page, "/index.html");
    await page.evaluate(() => localStorage.clear());
    await goto(page, "/favorites.html");
    await page.waitForSelector(".state-box", { timeout: 6000 });
    const text = await page.locator(".state-box").innerText();
    if (!/sign in|login/i.test(text)) throw new Error("no unauthorized state: " + text.slice(0, 80));
    await page.context().close();
  });

  /* ---------- 7. food detail + qty + add to cart ---------- */
  await test("7 food detail: quantity stepper and add to cart", async (errs) => {
    const page = await newPage(browser, errs, { auth: true });
    await goto(page, "/search.html?type=food");
    await page.waitForSelector("#results-zone .food-card", { timeout: 10000 });
    await page.locator("#results-zone .food-card .card-title a").first().click();
    await page.waitForSelector("#add-btn", { timeout: 8000 });
    const title = await page.locator(".food-detail-info h1").innerText();
    await page.click("#qty-plus");
    await page.click("#qty-plus");
    const qty = await page.locator("#qty-val").innerText();
    if (qty !== "3") throw new Error("qty should be 3, got " + qty);
    await page.click("#add-btn");
    await page.waitForSelector(".toast", { timeout: 5000 });
    await page.waitForTimeout(600);
    const badge = await page.locator(".cart-badge").first().innerText().catch(() => "0");
    if (badge === "0") throw new Error("cart badge did not update");
    await page.context().close();
    void title;
  });

  /* ---------- 8. favorites flow ---------- */
  await test("8 favorites: add on food page, list on favorites page, remove via modal", async (errs) => {
    const page = await newPage(browser, errs, { auth: true });
    await goto(page, "/search.html?type=food");
    await page.waitForSelector("#results-zone .food-card [data-fav]");
    await page.locator("#results-zone .food-card [data-fav]").first().click();
    await page.waitForTimeout(800);

    await goto(page, "/favorites.html");
    await page.waitForSelector("#fav-zone .food-card", { timeout: 10000 });
    const count = await page.locator("#fav-zone .food-card").count();
    if (count < 1) throw new Error("favorite not listed");

    await page.locator("#fav-zone .fav-btn.on").first().click();
    await page.waitForSelector(".modal [data-act='ok']", { timeout: 5000 });
    await page.click(".modal [data-act='ok']");
    await page.waitForTimeout(900);
    const after = await page.locator("#fav-zone .food-card").count();
    if (after >= count) throw new Error("remove favorite did not update list (" + after + ")");
    await page.context().close();
  });

  /* ---------- 9. cart: qty + summary ---------- */
  await test("9 cart: line items, qty change, server-priced summary", async (errs) => {
    const page = await newPage(browser, errs, { auth: true });
    await goto(page, "/search.html?type=food");
    await page.waitForSelector("#results-zone .food-card [data-add]");
    await page.locator("#results-zone .food-card [data-add]").first().click();
    await page.waitForTimeout(700);

    await goto(page, "/cart.html");
    await page.waitForSelector(".cart-row", { timeout: 10000 });
    const rows = await page.locator(".cart-row").count();
    if (rows < 1) throw new Error("no cart rows");

    await page.locator(".cart-row [data-inc]").first().click();
    await page.waitForTimeout(900);
    await page.waitForSelector(".cart-row");

    const shownTotal = await page.locator(".sum-row.total b").innerText();
    const server = await api(page, "GET", "/checkout");
    const expected = "₹" + Number(server.data.data.total).toLocaleString("en-IN");
    if (shownTotal !== expected) throw new Error("summary total " + shownTotal + " != server " + expected);

    const restOnRow = await page.locator(".cart-row .small.muted").first().innerText();
    if (!/restaurant|./.test(restOnRow)) throw new Error("row meta missing");
    await noOverflow(page);
    await page.context().close();
  });

  /* ---------- 10. checkout COD ---------- */
  await test("10 checkout: add address, place COD order, success screen", async (errs) => {
    const page = await newPage(browser, errs, { auth: true });
    await api(page, "POST", "/cart", { foodId: await firstFoodId(page), quantity: 1 });
    await goto(page, "/checkout.html");
    await page.waitForSelector("#addr-form, .address-options", { timeout: 10000 });
    await page.waitForSelector("#place-btn", { timeout: 10000 });

    const needAdd = (await page.locator(".address-options input[name=addr]").count()) === 0;
    if (needAdd) {
      if (!(await page.locator("#addr-form").isVisible())) {
        await page.click("#toggle-add-addr");
      }
      await page.fill("#addr-form input[name=fullName]", firstName + " Tester");
      await page.fill("#addr-form input[name=phone]", "9876543210");
      await page.fill("#addr-form input[name=houseNumber]", "22B Green Villa");
      await page.fill("#addr-form input[name=street]", "M.G. Road");
      await page.fill("#addr-form input[name=area]", "Indiranagar");
      await page.fill("#addr-form input[name=city]", "Bengaluru");
      await page.fill("#addr-form input[name=state]", "Karnataka");
      await page.fill("#addr-form input[name=pincode]", "560038");
      await page.click("#addr-form button[type=submit]");
      await page.waitForSelector(".address-options input[name=addr]", { timeout: 8000 });
    }

    await page.waitForSelector("#place-btn", { timeout: 8000 });
    await page.check("input[name=payMethod][value=COD]");
    await page.click("#place-btn");
    await page.waitForSelector(".success-box", { timeout: 12000 });
    const txt = await page.locator(".success-box").innerText();
    if (!/Order placed/i.test(txt)) throw new Error("no success screen: " + txt.slice(0, 80));
    if (!/cash/i.test(txt)) throw new Error("COD hint missing on success screen");

    const orders = await api(page, "GET", "/orders");
    orderA = orders.data.data[0];
    if (!orderA) throw new Error("order not created");
    if (orderA.status !== "placed") throw new Error("expected placed, got " + orderA.status);
    if (orderA.paymentStatus !== "pending") throw new Error("COD should be pending, got " + orderA.paymentStatus);
    await page.context().close();
  });

  /* ---------- 11. orders history ---------- */
  await test("11 order history: cards with status + payment badges", async (errs) => {
    const page = await newPage(browser, errs, { auth: true });
    await goto(page, "/orders.html");
    await page.waitForSelector(".order-card", { timeout: 10000 });
    const cards = await page.locator(".order-card").count();
    if (cards < 1) throw new Error("no orders listed");
    const text = await page.locator(".order-card").first().innerText();
    if (!/Placed|Confirmed|Preparing|Delivered|Cancelled/i.test(text)) throw new Error("no status badge");
    if (!/Pending|Paid|Unpaid|COD|No charge/i.test(text)) throw new Error("no payment badge");
    await noOverflow(page);
    await page.context().close();
  });

  /* ---------- 12. order tracker ---------- */
  await test("12 order detail: visual tracker with steps + timeline", async (errs) => {
    const page = await newPage(browser, errs, { auth: true });
    await goto(page, "/order.html?id=" + orderA._id);
    await page.waitForSelector(".steps .step", { timeout: 10000 });
    const steps = await page.locator(".steps .step").count();
    if (steps !== 5) throw new Error("expected 5 tracker steps, got " + steps);
    const done = await page.locator(".steps .step.done, .steps .step.current").count();
    if (done < 1) throw new Error("no active/done step");
    await page.waitForSelector(".timeline li", { timeout: 5000 });
    const payText = await page.locator(".order-side-col").innerText();
    if (!/cash|delivery/i.test(payText)) throw new Error("COD payment panel missing");
    await noOverflow(page);
    await page.context().close();
  });

  /* ---------- 13. cancel order ---------- */
  await test("13 cancel order from history with confirmation modal", async (errs) => {
    const page = await newPage(browser, errs, { auth: true });
    await goto(page, "/orders.html");
    await page.waitForSelector(".order-card [data-cancel]", { timeout: 10000 });
    await page.locator(".order-card [data-cancel]").first().click();
    await page.waitForSelector(".modal [data-act='ok']", { timeout: 5000 });
    await page.click(".modal [data-act='ok']");
    await page.waitForTimeout(1000);
    const cancelled = await page.locator(".order-card", { hasText: "Cancelled" }).count();
    if (cancelled < 1) throw new Error("no cancelled order after cancel");

    await page.goto(BASE + "/order.html?id=" + orderA._id, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".cancel-banner", { timeout: 8000 });
    const banner = await page.locator(".cancel-banner").innerText();
    if (!/cancelled/i.test(banner)) throw new Error("no cancelled banner");
    await page.context().close();
  });

  /* ---------- 14. mock payment success (UPI) ---------- */
  await test("14 checkout UPI: mock payment succeeds, order marked paid", async (errs) => {
    const page = await newPage(browser, errs, { auth: true });
    await api(page, "POST", "/cart", { foodId: await firstFoodId(page), quantity: 1 });
    await goto(page, "/checkout.html");
    await page.waitForSelector("#place-btn", { timeout: 10000 });
    await page.check("input[name=payMethod][value=MOCK_UPI]");
    await page.click("#place-btn");
    await page.waitForSelector(".success-box", { timeout: 12000 });
    const txt = await page.locator(".success-box").innerText();
    if (!/payment succeeded|Txn/i.test(txt)) throw new Error("no success payment text: " + txt.slice(0, 100));

    const orders = await api(page, "GET", "/orders");
    orderB = orders.data.data[0];
    if (orderB.paymentStatus !== "paid") throw new Error("order not marked paid: " + orderB.paymentStatus);
    await page.context().close();
  });

  /* ---------- 15. failed payment + retry ---------- */
  await test("15 declined payment shows failure screen, retry succeeds", async (errs) => {
    const page = await newPage(browser, errs, { auth: true });
    await api(page, "POST", "/cart", { foodId: await firstFoodId(page), quantity: 1 });
    await goto(page, "/checkout.html");
    await page.waitForSelector("#place-btn", { timeout: 10000 });
    await page.check("input[name=payMethod][value=MOCK_CARD]");
    await page.check("#sim-fail");
    await page.click("#place-btn");
    await page.waitForSelector("#retry-pay", { timeout: 12000 });
    const txt = await page.locator(".state-box.error").innerText();
    if (!/failed|declined/i.test(txt)) throw new Error("no failure screen: " + txt.slice(0, 80));
    await page.click("#retry-pay");
    await page.waitForSelector(".success-box", { timeout: 12000 });
    await page.context().close();
  });

  /* ---------- 16. complete payment from order page ---------- */
  await test("16 order page: pay panel for unpaid mock order", async (errs) => {
    const page = await newPage(browser, errs, { auth: true });
    const foodId = await firstFoodId(page);
    await api(page, "POST", "/cart", { foodId, quantity: 1 });
    const addrs = await api(page, "GET", "/addresses");
    const aid = addrs.data.data[0] && addrs.data.data[0]._id;
    if (!aid) throw new Error("no address available for order placement");
    const placed = await api(page, "POST", "/orders", { addressId: aid });
    if (placed.status !== 201) throw new Error("place order failed: " + JSON.stringify(placed.data).slice(0, 200));
    const oid = placed.data.order.orderId;
    await goto(page, "/order.html?id=" + oid + "&pay=1");
    await page.waitForSelector("#pay-now", { timeout: 10000 });
    await page.click("#pay-now");
    await page.waitForTimeout(1500);
    const side = await page.locator(".order-side-col").innerText();
    if (!/success|paid/i.test(side)) throw new Error("payment did not complete: " + side.slice(0, 120));
    const check = await api(page, "GET", "/payments/order/" + oid);
    if (check.data.data.paymentStatus !== "SUCCESS") throw new Error("payment not SUCCESS");
    await page.context().close();
  });

  /* ---------- 17. addresses CRUD ---------- */
  await test("17 addresses: add, edit, set default, delete", async (errs) => {
    const page = await newPage(browser, errs, { auth: true });
    await goto(page, "/addresses.html");
    await page.waitForSelector("#addr-zone", { timeout: 8000 });
    await page.waitForTimeout(600);
    const addedBefore = await page.locator(".addr-card").count();

    await page.click("#add-btn");
    await page.waitForSelector("#form-panel:not([hidden])");
    await page.fill("input[name=fullName]", firstName + " Tester");
    await page.fill("input[name=phone]", "9876543210");
    await page.fill("input[name=houseNumber]", "9 Cloud Apt");
    await page.fill("input[name=street]", "Lake View Road");
    await page.fill("input[name=area]", "HSR Layout");
    await page.fill("input[name=city]", "Bengaluru");
    await page.fill("input[name=state]", "Karnataka");
    await page.fill("input[name=pincode]", "560102");
    await page.click("#save-btn");
    // load() replaces the grid with a skeleton first, so poll until the card
    // count actually grows instead of sampling a transient empty state.
    await page.waitForFunction((n) => document.querySelectorAll(".addr-card").length > n, addedBefore, {
      timeout: 8000,
    });
    const added = await page.locator(".addr-card").count();
    if (added < 1) throw new Error("address not added");

    await page.locator(".addr-card [data-edit]").last().click();
    await page.waitForSelector("#form-panel:not([hidden])");
    await page.fill("input[name=street]", "Lake View Road Ext");
    await page.click("#save-btn");
    await page.waitForTimeout(1000);
    const body = await page.locator("#addr-zone").innerText();
    if (!body.includes("Lake View Road Ext")) throw new Error("edit did not persist");

    const defBtn = page.locator(".addr-card [data-default]").first();
    if (await defBtn.count()) {
      await defBtn.click();
      await page.waitForTimeout(900);
      const defCount = await page.locator(".addr-card", { hasText: "Default" }).count();
      if (defCount < 1) throw new Error("default badge missing after set default");
    }

    const before = await page.locator(".addr-card").count();
    await page.locator(".addr-card [data-del]").last().click();
    await page.waitForSelector(".modal [data-act='ok']");
    await page.click(".modal [data-act='ok']");
    await page.waitForTimeout(1000);
    const after = await page.locator(".addr-card").count();
    if (after >= before) throw new Error("delete did not remove card");
    await noOverflow(page);
    await page.context().close();
  });

  /* ---------- 18. profile ---------- */
  await test("18 profile: shows session user, logout works", async (errs) => {
    const page = await newPage(browser, errs, { auth: true });
    await goto(page, "/profile.html");
    await page.waitForSelector("#v-email", { timeout: 8000 });
    const shown = await page.locator("#v-email").innerText();
    if (shown !== email) throw new Error("profile email " + shown + " != " + email);
    const name = await page.locator("#v-name").innerText();
    if (!name.includes(firstName)) throw new Error("profile name wrong: " + name);
    await page.click("#logout-btn");
    await page.waitForSelector(".modal [data-act='ok']");
    await page.click(".modal [data-act='ok']");
    await page.waitForURL(/index\.html/, { timeout: 8000 });
    const token = await page.evaluate(() => localStorage.getItem("lm_token"));
    if (token) throw new Error("still logged in after profile logout");
    await page.context().close();
  });

  /* ---------- 19. search page ---------- */
  await test("19 search: debounced query, tabs, category filter, clear", async (errs) => {
    const page = await newPage(browser, errs);
    await goto(page, "/search.html");
    await page.fill("#q", "paneer");
    await page.waitForTimeout(1100);
    await page.waitForSelector("#results-zone .grid-food .card, .state-box", { timeout: 8000 });
    const foodResults = await page.locator("#results-zone .card-title").allTextContents();
    if (foodResults.length && !foodResults.join(" ").toLowerCase().includes("paneer")) {
      throw new Error("food search mismatch: " + foodResults.join(","));
    }
    await page.click(".tab[data-type=restaurant]");
    await page.waitForTimeout(900);
    await page.waitForSelector("#results-zone .grid-rest .card, .state-box", { timeout: 8000 });
    await page.click(".tab[data-type=food]");
    await page.waitForTimeout(500);
    const catChips = await page.locator("#cat-filter .chip").count();
    if (catChips < 5) throw new Error("category chips missing on search");
    await page.fill("#q", "");
    await page.waitForTimeout(900);
    await noOverflow(page);
    await page.context().close();
  });

  /* ---------- 20. responsive + a11y basics ---------- */
  await test("20 responsive: mobile/tablet widths, no overflow, mobile menu works", async (errs) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") errs.push("[console] " + m.text());
    });
    page.on("pageerror", (e) => errs.push("[pageerror] " + e.message));

    for (const path of ["/", "/restaurants.html", "/search.html", "/cart.html", "/login.html"]) {
      await goto(page, path);
      await noOverflow(page);
    }

    await goto(page, "/restaurants.html");
    await page.waitForSelector("#restaurants-zone .card, .state-box", { timeout: 8000 });
    const clipped = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll(".grid-rest .card").forEach((card) => {
        const cr = card.getBoundingClientRect();
        const foot = card.querySelector(".card-foot");
        if (foot && foot.scrollWidth > foot.clientWidth + 1) bad.push("foot overflows card");
        card.querySelectorAll(".card-foot .btn").forEach((btn) => {
          const br = btn.getBoundingClientRect();
          if (br.right > cr.right + 1 || br.left < cr.left - 1) {
            bad.push("button outside card by " + Math.round(br.right - cr.right) + "px");
          }
        });
      });
      return bad;
    });
    if (clipped.length) throw new Error("restaurant card overflow @360: " + clipped.join("; "));

    await goto(page, "/");
    const toggleVisible = await page.locator("#nav-toggle").isVisible();
    if (!toggleVisible) throw new Error("nav toggle hidden at 360px");
    await page.click("#nav-toggle");
    await page.waitForSelector("#mobile-menu.open", { timeout: 3000 });
    const menuText = await page.locator("#mobile-menu").innerText();
    if (!/restaurants/i.test(menuText)) throw new Error("mobile menu links missing");

    await page.setViewportSize({ width: 768, height: 1024 });
    await goto(page, "/restaurants.html");
    await page.waitForTimeout(700);
    await noOverflow(page);

    await page.setViewportSize({ width: 1280, height: 900 });
    await goto(page, "/");
    await page.waitForTimeout(700);
    await noOverflow(page);

    const imgs = await page.evaluate(() =>
      Array.from(document.images)
        .filter((i) => !i.complete || i.naturalWidth === 0)
        .map((i) => i.currentSrc || i.src)
    );
    if (imgs.length) throw new Error("broken images: " + imgs.join(", "));
    await ctx.close();
  });

  /* ---------- 21. assets + backend intact ---------- */
  await test("21 assets served, API still healthy, all pages return 200", async (errs) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const paths = [
      "/", "/restaurants.html", "/restaurant.html?id=x", "/food.html?id=x", "/search.html",
      "/favorites.html", "/cart.html", "/checkout.html", "/addresses.html", "/orders.html",
      "/order.html?id=x", "/login.html", "/register.html", "/profile.html",
      "/css/styles.css", "/js/api.js", "/js/auth.js", "/js/ui.js", "/js/home.js",
      "/js/restaurants.js", "/js/restaurant.js", "/js/food.js", "/js/search.js",
      "/js/favorites.js", "/js/cart.js", "/js/checkout.js", "/js/addresses.js",
      "/js/orders.js", "/js/order.js",
      "/assets/favicon.svg", "/assets/images/foods/default.svg",
      "/assets/images/restaurants/default.svg",
    ];
    for (const p of paths) {
      const res = await page.goto(BASE + p, { waitUntil: "domcontentloaded" });
      if (res.status() !== 200) throw new Error(p + " -> " + res.status());
    }
    const health = await page.evaluate(async () => (await fetch("/api/health")).json());
    if (!health.success || health.database !== "connected") throw new Error("API unhealthy");
    await ctx.close();
    void errs;
  });

  /* ---------- 22. home category chips ---------- */
  await test("22 home category chips map to valid backend food categories", async (errs) => {
    const page = await newPage(browser, errs);
    await goto(page, "/");
    await page.waitForSelector(".cat-card");
    const cats = await page.locator(".cat-card").evaluateAll((els) => els.map((e) => e.dataset.cat));
    if (cats.length < 5) throw new Error("category rail too small: " + cats.length);
    for (const c of cats) {
      const st = await page.evaluate(async (cat) => {
        const r = await fetch("/api/foods?category=" + encodeURIComponent(cat) + "&limit=1");
        return r.status;
      }, c);
      if (st !== 200) throw new Error('category "' + c + '" rejected with HTTP ' + st);
    }
    await page.locator(".cat-card").first().click();
    await page.waitForURL(/search\.html/);
    await page.waitForTimeout(1300);
    if (await page.locator(".state-box.error").count()) {
      throw new Error("category chip led to an error state");
    }
    await page.context().close();
  });

  /* ---------- 23. restaurants filter / empty / error retry ---------- */
  await test("23 restaurants: cuisine filter, empty state, API error retry", async (errs) => {
    const page = await newPage(browser, errs);
    await goto(page, "/restaurants.html");
    await page.waitForSelector("#rest-cats .chip", { timeout: 8000 });
    const chips = await page.locator("#rest-cats .chip").allTextContents();
    if (chips.length < 2 || chips[0].trim() !== "All") {
      throw new Error("cuisine chips missing: " + JSON.stringify(chips));
    }

    const hits = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/restaurants?")) hits.push(r.url());
    });
    await page.locator("#rest-cats .chip:not(.on)").first().click();
    await page.waitForTimeout(1300);
    if (!hits.some((u) => u.includes("cuisine="))) throw new Error("cuisine filter not sent to API");
    await page.locator('#rest-cats .chip[data-cuisine="All"]').click();
    await page.waitForTimeout(1300);
    if (!(await page.locator("#restaurants-zone .card").count())) throw new Error("All filter returned nothing");

    await page.fill("#rest-q", "zzz-nothing-matches-zzz");
    await page.waitForTimeout(1300);
    if (!(await page.locator(".state-box").count())) throw new Error("no empty state for impossible search");
    await page.click("#empty-clear");
    await page.waitForTimeout(1300);
    if (!(await page.locator("#restaurants-zone .card").count())) throw new Error("clear did not restore results");
    await page.context().close();

    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await p2.goto(BASE + "/restaurants.html", { waitUntil: "domcontentloaded" });
    await p2.route("**/api/restaurants?**", (route) => route.abort("failed"));
    await p2.reload({ waitUntil: "domcontentloaded" });
    await p2.waitForTimeout(1600);
    if (!(await p2.locator(".state-box.error").count())) throw new Error("no error state on API failure");
    await p2.unroute("**/api/restaurants?**");
    await p2.click(".state-box.error .btn");
    await p2.waitForTimeout(1600);
    if (!(await p2.locator("#restaurants-zone .card").count())) throw new Error("retry did not recover");
    await ctx.close();
  });

  await browser.close();

  log("");
  log("========================================");
  log("TOTAL: " + results.length + "  PASS: " + results.filter((r) => r[0] === "PASS").length + "  FAIL: " + failures);
  log("========================================");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  log("HARNESS ERROR: " + (e && e.stack ? e.stack : e));
  process.exit(2);
});

async function firstFoodId(page) {
  const res = await api(page, "GET", "/foods?limit=1&sort=name_asc");
  return res.data.data[0]._id;
}
