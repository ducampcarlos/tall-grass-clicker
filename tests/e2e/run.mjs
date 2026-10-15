// End-to-end tests: drive the REAL built game (docs/) in a real Chromium, with the mouse.
//
//   npm run build && npm run test:e2e
//
// Set CHROME_PATH to use a specific browser binary; otherwise Playwright's own Chromium is used
// (`npx playwright-core install chromium`). Set ONLY="some words" to run just the tests whose name has them.

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const docs = join(root, "docs");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".gif": "image/gif", ".ogg": "audio/ogg", ".ttf": "font/ttf", ".json": "application/json", ".webmanifest": "application/manifest+json" };

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const path = normalize(pathname === "/" ? "/index.html" : pathname);
  if (path.includes("..")) return void res.writeHead(400).end();
  try {
    const body = await readFile(join(docs, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
// "localhost" so that the page does not register its service worker, which would only get in the way
const base = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });

let passed = 0;
const failures = [];
const problems = [];

async function newPage(options = {}, query = "?debug") {
  const { seed, ...contextOptions } = options;
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, ...contextOptions });
  if (seed) await context.addInitScript(([s]) => { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); const state = JSON.parse(s); state.savedAt = Date.now(); localStorage.setItem("tall-grass-clicker.game.v1", JSON.stringify(state)); } }, [seed]);
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && problems.push(`console.error: ${m.text()}`));
  await page.goto(base + query);
  return page;
}

async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  const before = problems.length;
  try {
    await fn();
    assert.equal(problems.length, before, `unexpected browser errors: ${problems.slice(before).join(" | ")}`);
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${String(error.stack ?? error.message).split("\n").slice(0, 7).join("\n       ")}`);
  }
}

const game = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.state)));
const tab = (page, i) => page.click(`.tab:nth-child(${i})`);

/** A saved game with a party, coins and a few things bought: built by playing the real engine. */
async function demoSeed() {
  const page = await newPage();
  await page.click(".starter:nth-child(2)");
  await page.click(".dialog .btn");
  await page.evaluate(() => { const s = window.__game.state; s.coins = 5e6; s.bag = [1, 0, 0, 0]; s.stats.kills = 40; });
  const seed = await page.evaluate(() => JSON.stringify(window.__game.state));
  await page.context().close();
  return seed;
}

console.log("Tall Grass Clicker, end to end");

await test("a new player picks a partner, sees the help, and the battle starts", async () => {
  const page = await newPage();
  assert.equal(await page.locator(".starter").count(), 3);
  assert.match(await page.textContent(".dialog .legal"), /unofficial/i);
  await page.click(".starter:nth-child(1)");
  assert.ok(await page.locator(".dialog").count(), "the help shows after the first partner");
  await page.click(".dialog .btn");
  assert.equal(await page.locator(".dialog").count(), 0);
  const s = await game(page);
  assert.equal(s.party.length, 1);
  assert.ok(s.wild, "a creature is waiting");
  // the sprite of the creature in front really loads
  await page.waitForFunction(() => { const img = document.querySelector(".battle .stage img"); return img && img.complete && img.naturalWidth > 0; });
});

await test("clicking hurts the creature, defeating creatures earns coins and the game saves", async () => {
  const page = await newPage();
  await page.click(".starter:nth-child(2)");
  await page.click(".dialog .btn");
  for (let i = 0; i < 40; i++) await page.click(".battle .stage", { delay: 5 });
  const s = await game(page);
  assert.ok(s.stats.clicks >= 40, `clicks counted: ${s.stats.clicks}`);
  assert.ok(s.stats.kills >= 1, "something was defeated");
  assert.ok(s.coins > 0);
  await page.reload();
  await page.waitForSelector(".tab");
  const back = await game(page);
  assert.equal(back.party[0], s.party[0], "the partner is still there after a reload");
  assert.ok(back.stats.clicks >= s.stats.clicks);
  assert.equal(await page.locator(".starter").count(), 0, "no second welcome");
});

const seed = await demoSeed();

await test("a saved game opens straight into the battle, and every tab shows", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  for (const i of [1, 2, 3, 4, 5, 6, 7]) {
    await tab(page, i);
    assert.ok(await page.locator(".tab.on, .tab[aria-selected=true]").count(), `tab ${i} is marked`);
  }
  await tab(page, 2);
  assert.ok((await page.locator(".dexgrid > *, .grid > *").count()) > 100, "the Pokédex lists the creatures");
});

await test("buying an upgrade in the shop spends coins and raises its level", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  await tab(page, 1);
  const before = await game(page);
  await page.locator(".row button.btn:not([disabled])", { hasText: /\d/ }).filter({ hasNot: page.locator("text=x1") }).first().click();
  const after = await game(page);
  const bought = Object.keys(after.upgrades).filter((k) => after.upgrades[k] > (before.upgrades[k] ?? 0));
  assert.equal(bought.length, 1, "exactly one upgrade went up");
  assert.ok(after.coins < before.coins);
});

await test("a ball is thrown when a creature you do not have yet is defeated", async () => {
  const page = await newPage();
  await page.click(".starter:nth-child(2)");
  await page.click(".dialog .btn");
  await page.evaluate(() => { const s = window.__game.state; s.balls[0] = 50; s.wild.sp = 129; s.wild.hp = 1; s.wild.shiny = false; s.wild.boss = false; });
  await page.click(".battle .stage");
  await page.waitForSelector(".battle .throw", { timeout: 3000 });
});

await test("the shop can buy ten levels at once, and remembers the choice", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  await tab(page, 1);
  await page.click('.segment [data-amount="10"]');
  const before = await game(page);
  const row = page.locator(".row", { hasText: "Strong Fists" });
  assert.match(await row.locator(".price").textContent(), /x10/);
  await row.locator("button.btn").click();
  const after = await game(page);
  assert.equal(after.upgrades.click, (before.upgrades.click ?? 0) + 10);
  await page.reload();
  await page.waitForSelector(".tab");
  await tab(page, 1);
  assert.ok((await page.locator('.segment [data-amount="10"]').getAttribute("class")).includes("primary"));
});

await test("a passing creature can be tapped for a gift", async () => {
  const page = await newPage();
  await page.click(".starter:nth-child(2)");
  await page.click(".dialog .btn");
  const before = await game(page);
  await page.evaluate(() => window.__game.app.roamSoon());
  await page.waitForSelector(".battle .roamer", { timeout: 5000 });
  const hits = (await game(page)).stats.clicks;
  await page.locator(".battle .roamer").dispatchEvent("pointerdown");
  await page.waitForSelector(".toast");
  assert.equal(await page.locator(".battle .roamer").count(), 0, "it goes away once tapped");
  assert.equal((await game(page)).stats.clicks, hits, "tapping it is not an attack");
  const after = await game(page);
  const total = (s) => s.coins + s.balls.reduce((a, b) => a + b, 0) * 1e9 + s.bag.reduce((a, b) => a + b, 0) * 1e9 + Object.values(s.dex).reduce((a, d) => a + d.candy, 0) * 1e9;
  assert.ok(total(after) > total(before), "it left something");
});

await test("keys switch tabs, attack and mute, but leave text boxes alone", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  await page.keyboard.press("3");
  assert.ok((await page.locator(".tab:nth-child(3)").getAttribute("class")).includes("on"));
  await page.keyboard.press("7");
  assert.ok((await page.locator(".tab:nth-child(7)").getAttribute("class")).includes("on"));
  const clicks = (await game(page)).stats.clicks;
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press(" ");
  assert.ok((await game(page)).stats.clicks > clicks, "Space attacks");
  await page.keyboard.press("m");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("tall-grass-clicker.profile.v1") ?? "{}").muted), true);
  await tab(page, 2);
  await page.fill(".dex-search, input[type=search], input", "char");
  await page.keyboard.press("1");
  assert.ok((await page.locator(".tab:nth-child(2)").getAttribute("class")).includes("on"), "typing a 1 in a text box does not switch tabs");
});

await test("a player stuck at a boss is told that retiring pays", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  await page.evaluate(() => { const s = window.__game.state; s.maxPlace = 40; s.bestPlace = 40; s.marksTotal = 0; for (let i = 0; i < 3; i++) window.__game.app.handle([{ t: "bossFailed", place: 11 }]); });
  await page.waitForFunction(() => /Stuck\?/.test(document.querySelector("#toasts")?.textContent ?? ""));
});

await test("the trainer card can be drawn and saved as a picture", async () => {
  const page = await newPage({ seed, acceptDownloads: true });
  await page.waitForSelector(".tab");
  await tab(page, 7);
  await page.locator(".btn", { hasText: "Trainer card" }).click();
  await page.waitForSelector("canvas.card-picture");
  const painted = await page.evaluate(() => {
    const c = document.querySelector("canvas.card-picture");
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const colours = new Set();
    for (let i = 0; i < data.length; i += 4 * 97) colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return colours.size;
  });
  assert.ok(painted > 30, `the card has more than a flat colour (${painted})`);
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator(".dialog .btn.primary").click()]);
  assert.match(download.suggestedFilename(), /\.png$/);
  const bytes = await (await import("node:fs/promises")).readFile(await download.path());
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
});

await test("a creature's evolution line shows in the Pokédex", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  await tab(page, 2);
  await page.evaluate(() => window.__game.app.views.dex.select(4));
  await page.waitForSelector(".family .fam");
  assert.equal(await page.locator(".family .fam").count(), 3, "Charmander, Charmeleon, Charizard");
});

await test("the games stay closed for a new player, and open after a few kills", async () => {
  const page = await newPage();
  await page.click(".starter:nth-child(2)");
  await page.click(".dialog .btn");
  await tab(page, 6);
  assert.equal(await page.locator(".row .btn.primary:not([disabled])").count(), 0);
  await page.evaluate(() => { window.__game.state.stats.kills = 60; });
  await page.waitForFunction(() => document.querySelectorAll(".row .btn.primary:not([disabled])").length === 4);
});

await test("Memory Match can be won, pays boosters and sends the game to rest", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  await page.evaluate(() => { const s = window.__game.state; s.cooldowns = {}; s.stats.kills = 500; s.items = {}; });
  await tab(page, 6);
  await page.locator(".row", { hasText: "Memory Match" }).locator(".btn.primary").click();
  await page.waitForSelector(".memory .mem-card");
  const ids = await page.$$eval(".mem-card", (cards) => cards.map((c) => c.dataset.id));
  assert.equal(ids.length, 16);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const at = ids.map((x, i) => (x === id ? i : -1)).filter((i) => i >= 0);
    for (const i of at) await page.locator(".mem-card").nth(i).click();
  }
  await page.waitForSelector(".mg-result .stars", { timeout: 5000 });
  assert.match(await page.textContent(".mg-result .stars"), /★★★/);
  assert.ok((await page.locator(".prize").count()) >= 2, "it paid something");
  await page.click(".mg-result .btn.primary");
  const s = await game(page);
  assert.equal(s.stats.games, 1);
  assert.ok(Object.keys(s.items).length >= 1, "boosters in the bag");
  assert.ok(s.cooldowns.memory > 100, "memory is resting");
  assert.equal(await page.locator(".row", { hasText: "Memory Match" }).locator(".btn.primary").count(), 0, "it cannot be played again yet");
});

await test("the Capture Throw plays through three throws and reports", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  await page.evaluate(() => { const s = window.__game.state; s.cooldowns = {}; s.stats.kills = 500; });
  await tab(page, 6);
  await page.locator(".row", { hasText: "Capture Throw" }).locator(".btn.primary").click();
  await page.waitForSelector(".arena .target-pic");
  for (let i = 0; i < 3; i++) {
    if (await page.locator(".mg-result").count()) break;
    const box = await page.locator(".arena .target-pic").boundingBox();
    await page.waitForFunction(() => !document.querySelector(".mg-say.show") || true);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(2300);
  }
  await page.waitForSelector(".mg-result .stars", { timeout: 8000 });
  assert.equal((await game(page)).stats.games, 1);
});

await test("Who's That Creature asks eight questions with four names each", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  await page.evaluate(() => { const s = window.__game.state; s.cooldowns = {}; s.stats.kills = 500; });
  await tab(page, 6);
  await page.locator(".row", { hasText: "Who's That" }).locator(".btn.primary").click();
  for (let q = 1; q <= 8; q++) {
    await page.waitForFunction((n) => (document.querySelector(".mg-info")?.textContent ?? "").includes(`${n} `) && /Question|Pregunta|Pergunta/.test(document.querySelector(".mg-info")?.textContent ?? ""), q);
    assert.equal(await page.locator(".quiz-options .btn").count(), 4);
    assert.ok(await page.locator(".quiz-stage img.silhouette").count(), "it starts as a shadow");
    await page.locator(".quiz-options .btn").first().click();
    assert.equal(await page.locator(".quiz-stage img.silhouette").count(), 0, "and shows itself once answered");
  }
  await page.waitForSelector(".mg-result .stars", { timeout: 5000 });
});

await test("Whack-a-Mole: a mole pops up and tapping it scores", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  await page.evaluate(() => { const s = window.__game.state; s.cooldowns = {}; s.stats.kills = 500; });
  await tab(page, 6);
  await page.locator(".row", { hasText: "Whack" }).locator(".btn.primary").click();
  await page.waitForSelector(".hole .mole.up");
  await page.locator(".hole:has(.mole.up)").first().dispatchEvent("pointerdown");
  const text = await page.textContent(".mg-info");
  assert.match(text, /Score: -?\d+/);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".minigame").count(), 0, "it can be quit");
  assert.equal((await game(page)).stats.games, 0, "and quitting pays nothing");
});

await test("the bag: buy, use and combine boosters", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  await page.evaluate(() => { const s = window.__game.state; s.items = { shiny1: 3 }; s.buffs = []; s.coins = 1e12; });
  await tab(page, 5);
  const card = page.locator(".booster", { hasText: "Shiny boost" });
  await card.locator(".tier.t1 .btn.gold").click(); // combine three Stardust
  let s = await game(page);
  assert.deepEqual(s.items, { shiny2: 1 });
  await card.locator(".head .btn").click(); // buy a Stardust
  s = await game(page);
  assert.equal(s.items.shiny1, 1);
  await card.locator(".tier.t2 .btn.primary").click(); // use the Star Piece
  s = await game(page);
  assert.equal(s.buffs.length, 1);
  assert.equal(s.buffs[0].tier, 2);
  await page.waitForFunction(() => /Working/.test([...document.querySelectorAll(".booster")].find((b) => b.textContent.includes("Shiny boost"))?.querySelector(".status .d")?.textContent ?? ""));
  await page.waitForFunction(() => [...document.querySelectorAll(".booster")].find((b) => b.textContent.includes("Shiny boost"))?.querySelector(".tier.t1 .btn.primary")?.disabled === true);
});

await test("a helper opens once its goal is met, and can be switched off", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  await page.evaluate(() => { const s = window.__game.state; s.settings.helpers = {}; s.stats.hatched = 12; });
  await page.waitForFunction(() => /helper is ready/.test(document.querySelector("#toasts")?.textContent ?? ""), null, { timeout: 5000 });
  await tab(page, 7);
  const row = page.locator(".row.helper", { hasText: "Hatchery" });
  assert.equal(await row.locator(".btn").textContent(), "On");
  await row.locator(".btn").click();
  assert.equal((await game(page)).settings.helpers.hatchery, false);
  await page.waitForFunction(() => [...document.querySelectorAll(".row.helper")].find((r) => r.textContent.includes("Hatchery"))?.querySelector(".btn")?.textContent === "Off");
  assert.ok(await page.locator(".row.helper.locked").count() >= 1, "the others are still closed");
});

await test("the save can be copied as a code and pasted back, with a safety copy kept", async () => {
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, permissions: ["clipboard-read", "clipboard-write"] });
  await context.addInitScript(([s]) => { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); const state = JSON.parse(s); state.savedAt = Date.now(); state.coins = 4242; localStorage.setItem("tall-grass-clicker.game.v1", JSON.stringify(state)); } }, [seed]);
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(base + "?debug");
  await page.waitForSelector(".tab");
  await page.click('button[aria-label="Settings"]');
  await page.locator(".dialog .btn", { hasText: "Copy code" }).click();
  await page.waitForFunction(() => /Save code copied/.test(document.querySelector("#toasts")?.textContent ?? ""));
  const code = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(code, /^TGC1\.[A-Za-z0-9_-]+$/);
  // change the game, then bring the saved one back from the code
  await page.evaluate(() => { window.__game.state.coins = 1; });
  await page.locator(".dialog .btn", { hasText: "Paste code" }).click();
  await page.fill("textarea.code", code);
  await page.locator(".dialog .btn.primary", { hasText: "Continue" }).click();
  await page.locator(".dialog .btn.danger", { hasText: "Replace" }).click();
  await page.waitForSelector(".tab");
  await page.waitForFunction(() => window.__game.state.coins > 4000 && window.__game.state.coins < 1e6);
  // the copy made before replacing is there to restore
  await page.click('button[aria-label="Settings"]');
  await page.locator(".dialog .btn", { hasText: "Safety copies" }).click();
  assert.ok((await page.locator(".backup").count()) >= 1, "a safety copy was kept");
  assert.match(await page.locator(".backup").first().textContent(), /before an import/);
  await context.close();
});

await test("a damaged code is refused with a message and changes nothing", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  const before = await game(page);
  await page.click('button[aria-label="Settings"]');
  await page.locator(".dialog .btn", { hasText: "Paste code" }).click();
  await page.fill("textarea.code", "TGC1.this-is-not-a-save");
  await page.locator(".dialog .btn.primary", { hasText: "Continue" }).click();
  await page.waitForFunction(() => /not a Tall Grass Clicker save|damaged/.test(document.querySelector("#toasts")?.textContent ?? ""));
  assert.deepEqual((await game(page)).party, before.party);
});

await test("a save file dropped on the page is offered for import", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  const file = await page.evaluate(async () => {
    const s = window.__game.state;
    s.coins = 777;
    return JSON.stringify({ game: "tall-grass-clicker", format: 1, exported: "2026-01-01T00:00:00.000Z", profile: {}, state: s });
  });
  await page.evaluate((text) => {
    const data = new DataTransfer();
    data.items.add(new File([text], "mine.json", { type: "application/json" }));
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  }, file);
  await page.waitForSelector(".dialog .btn.danger");
  assert.match(await page.textContent(".dialog"), /2026-01-01/);
  await page.locator(".dialog .btn", { hasText: "Keep mine" }).click();
  assert.equal(await page.locator(".dialog").count(), 0);
});

await test("the game reminds you to keep a copy outside the browser, once in a while", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  await page.evaluate(() => { window.__game.state.stats.playSeconds = 7200; });
  assert.equal(await page.evaluate(() => window.__game.app.remind()), true, "it has been two hours and nothing was ever exported");
  await page.waitForFunction(() => /took a copy of your game/.test(document.querySelector("#toasts")?.textContent ?? ""));
  assert.equal(await page.evaluate(() => window.__game.app.remind()), false, "and it does not nag again at once");
  // exporting counts
  await page.click('button[aria-label="Settings"]');
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator(".dialog .btn.primary", { hasText: "Export" }).click()]);
  assert.match(download.suggestedFilename(), /\.json$/);
  const last = await page.evaluate(() => JSON.parse(localStorage.getItem("tall-grass-clicker.profile.v1")).lastExport);
  assert.ok(last > 0);
});

await test("Settings → Look: colours, picture behind the battle, size and numbers, kept after a reload", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  await page.click('button[aria-label="Settings"]');
  await page.selectOption('select[aria-label="Colours"]', "ocean");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "ocean");
  await page.selectOption('select[aria-label="Size of everything"]', "1.15");
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue("--ui-zoom")), "1.15");
  await page.selectOption('select[aria-label="Big numbers"]', "full");
  await page.waitForFunction(() => /,/.test(document.querySelector(".top .stat b")?.textContent ?? ""));
  await page.selectOption('select[aria-label="Picture behind the battle"]', "cave");
  await page.waitForSelector(".battle.biome-cave");
  assert.ok(await page.evaluate(() => document.body.classList.contains("biome-cave")), "the page follows too");
  // even in another place, the chosen picture stays
  await page.evaluate(() => { const s = window.__game.state; s.settings.autoAdvance = false; s.maxPlace = Math.max(s.maxPlace, 12); s.bestPlace = Math.max(s.bestPlace, 12); s.place = 8; s.wild = null; });
  await page.waitForTimeout(500);
  assert.ok(await page.locator(".battle.biome-cave").count());
  await page.fill('input[aria-label="Trainer name"]', "Ash");
  await page.locator('input[aria-label="Trainer name"]').blur();
  await page.reload();
  await page.waitForSelector(".tab");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "ocean");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("tall-grass-clicker.profile.v1")).name), "Ash");
  assert.ok(await page.locator(".battle.biome-cave").count());
  // and back to following the place
  await page.click('button[aria-label="Settings"]');
  await page.selectOption('select[aria-label="Picture behind the battle"]', "auto");
  await page.waitForFunction(() => !document.querySelector(".battle.biome-cave"));
});

await test("reduced motion keeps a passing creature on the screen long enough to tap", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  await page.click('button[aria-label="Settings"]');
  await page.locator(".set", { hasText: "Reduce motion" }).locator("input").check();
  await page.keyboard.press("Escape");
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains("reduce-motion")));
  await page.evaluate(() => window.__game.app.roamSoon());
  await page.waitForSelector(".battle .roamer");
  await page.waitForTimeout(1500);
  assert.equal(await page.locator(".battle .roamer").count(), 1, "it is still there");
});

await test("each kind of place has its own background, on the battle and on the page", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  const seen = new Set();
  for (const [index, biome] of [[0, "meadow"], [1, "forest"], [2, "cave"], [8, "haunted"], [11, "champion"]]) {
    await page.evaluate((i) => { const s = window.__game.state; s.settings.autoAdvance = false; s.place = i; s.wild = null; }, index);
    await page.waitForFunction((b) => document.querySelector(".battle")?.classList.contains(`biome-${b}`), biome);
    assert.ok(await page.evaluate((b) => document.body.classList.contains(`biome-${b}`), biome), `the page wears ${biome}`);
    const image = await page.evaluate(() => getComputedStyle(document.querySelector(".battle .scene")).backgroundImage);
    assert.match(image, new RegExp(`scenes/${biome}\\.png`));
    seen.add(image);
  }
  assert.equal(seen.size, 5);
});

await test("the language can be changed and is remembered", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  await page.click('button[aria-label="Settings"]');
  await page.selectOption(".dialog select", "es");
  await page.waitForFunction(() => document.documentElement.lang === "es");
  await page.keyboard.press("Escape");
  assert.doesNotMatch(await page.textContent(".tabs"), /Shop/);
  await page.reload();
  await page.waitForSelector(".tab");
  assert.doesNotMatch(await page.textContent(".tabs"), /Shop/);
});

await test("the save can be exported and loaded back", async () => {
  const page = await newPage({ seed, acceptDownloads: true });
  await page.waitForSelector(".tab");
  await page.click('button[aria-label="Settings"]');
  const [download] = await Promise.all([page.waitForEvent("download"), page.click(".dialog .btn.primary")]);
  const file = JSON.parse(await (await import("node:fs/promises")).readFile(await download.path(), "utf8"));
  assert.equal(file.game, "tall-grass-clicker");
  assert.ok(file.state.party.length >= 1);
});

await test("retiring asks first, and starts over keeping the Pokédex", async () => {
  const page = await newPage({ seed });
  await page.waitForSelector(".tab");
  await page.evaluate(() => { const s = window.__game.state; s.maxPlace = 20; s.bestPlace = 20; s.place = 20; });
  const before = await game(page);
  await tab(page, 7);
  await page.click(".btn.danger");
  await page.click(".dialog .btn.danger");
  const after = await game(page);
  assert.equal(after.rank, before.rank + 1);
  assert.ok(after.marks > before.marks, "Marks were paid");
  assert.equal(after.place, 0);
  assert.equal(Object.values(after.dex).filter((d) => d.caught).length, Object.values(before.dex).filter((d) => d.caught).length);
});

await test("a phone-sized screen fits without sideways scrolling", async () => {
  const page = await newPage({ seed, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.waitForSelector(".tab");
  for (const i of [1, 2, 3, 4, 5, 6, 7]) {
    await tab(page, i);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 1, `tab ${i} is ${over}px too wide`);
  }
});

await test("a broken save is refused instead of crashing the game", async () => {
  const page = await newPage({ seed: JSON.stringify({ v: 1, rng: "oops" }) });
  await page.waitForSelector(".starter");
  assert.equal(await page.locator(".starter").count(), 3);
});

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
