const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "../_site");
const output = path.resolve(__dirname, "../test-results");
const prefix = "/Hercent.github.io";
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".pdf": "application/pdf" };
const luminance = (hex) => {
  let value = hex.trim().replace("#", "");
  if (value.length === 3) value = [...value].map((digit) => digit + digit).join("");
  const channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const relative = decodeURIComponent(url.pathname).replace(/^\/Hercent\.github\.io(?=\/|$)/, "");
  let file = path.resolve(root, `.${relative}`);
  if (!file.startsWith(root + path.sep) && file !== root) {
    res.writeHead(403).end();
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader("Content-Type", `${types[path.extname(file)] || "application/octet-stream"}${/\.(html|css|js)$/.test(file) ? "; charset=utf-8" : ""}`);
  fs.createReadStream(file).pipe(res);
});

async function main() {
  fs.mkdirSync(output, { recursive: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = process.env.SITE_URL?.replace(/\/$/, "") || `http://127.0.0.1:${server.address().port}${prefix}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const visit = async (route) => {
      const response = await page.goto(base + route, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200, route);
    };
    const noOverflow = async () => {
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow at ${page.url()}`);
    };
    const checkPalette = async () => {
      const palette = await page.locator("html").evaluate((el) => {
        const css = getComputedStyle(el);
        return Object.fromEntries(["bg", "surface", "raised", "code", "text", "muted", "accent", "warm", "accent-ink"]
          .map((key) => [key, css.getPropertyValue(`--${key}`).trim()]));
      });
      for (const background of ["bg", "surface", "raised", "code"]) {
        for (const foreground of ["text", "muted", "accent", "warm"]) {
          assert(contrast(palette[background], palette[foreground]) >= 4.5, `${foreground} on ${background} text contrast`);
        }
      }
      assert(contrast(palette.accent, palette["accent-ink"]) >= 4.5, "Button text contrast");
    };
    await visit("/");
    await checkPalette();
    assert.equal(await page.locator(".note-row").count(), 6);
    assert.equal(await page.locator(".case-study").count(), 1);
    const featuredPath = await page.locator(".case-link").getAttribute("href");
    const featuredResponse = await context.request.get(new URL(featuredPath, base).href);
    assert.equal(featuredResponse.status(), 200, "Featured report link");
    assert.equal(await page.locator(".case-metrics > div").count(), 3);
    await page.locator(".case-evidence img").scrollIntoViewIfNeeded();
    await page.locator(".case-evidence img").evaluate((img) => img.decode());
    assert(await page.locator(".case-evidence img").evaluate((img) => img.naturalWidth > 0));
    await page.evaluate(() => scrollTo(0, 0));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const motion = await page.locator(".trace-flow").evaluate((el) => {
      const css = getComputedStyle(el);
      return { name: css.animationName, iterations: css.animationIterationCount, duration: css.animationDuration };
    });
    assert.deepEqual(motion, { name: "trace-draw", iterations: "1", duration: "4s" });
    assert.equal(await page.locator(".research-glyph").count(), 3);
    const stage = page.locator("[data-analysis-stage]");
    const bounds = await stage.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .3);
    assert.notEqual(await stage.evaluate((el) => el.style.getPropertyValue("--tilt-y")), "");
    await page.mouse.move(0, 0);
    assert.equal(await stage.evaluate((el) => el.style.getPropertyValue("--tilt-y")), "");
    await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .3);
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.locator(".trace-flow").evaluate((el) => getComputedStyle(el).animationName), "none");
    await page.waitForFunction(() => document.querySelector("[data-analysis-stage]").style.getPropertyValue("--tilt-y") === "");
    await noOverflow();
    await page.screenshot({ path: path.join(output, "home-first-screen.png"), fullPage: false });
    await page.screenshot({ path: path.join(output, "home-desktop.png"), fullPage: true });
    await page.locator(".case-study").screenshot({ path: path.join(output, "featured-report.png") });
    await page.locator("[data-theme-toggle]").click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
    await checkPalette();
    await page.reload();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
    await page.screenshot({ path: path.join(output, "home-light.png"), fullPage: true });
    await page.locator("[data-theme-toggle]").click();

    await visit("/posts/");
    const total = await page.locator(".post-row").count();
    assert(total > 30);
    const dates = await page.locator(".post-row .post-meta").allTextContents();
    assert.deepEqual(dates, [...dates].sort().reverse(), "Archive must be newest first");
    const hrefs = await page.locator(".post-row h2 a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    assert.equal(new Set(hrefs).size, total, "Each entry is listed exactly once");
    const search = page.locator("[data-post-search]");
    await search.fill("fuzzing");
    const matching = await page.locator(".post-row:visible").count();
    assert(matching > 0 && matching < total);
    await search.fill("no-such-entry-357891");
    assert.equal(await page.locator(".post-row:visible").count(), 0);
    assert(await page.locator("[data-search-empty]").isVisible());
    await search.fill("");
    assert.equal(await page.locator(".post-row:visible").count(), total);
    await page.screenshot({ path: path.join(output, "archive-desktop.png"), fullPage: false });

    await visit("/posts/ethernaut-writeups/");
    const tabs = page.locator("[data-tab-trigger]");
    await tabs.nth(1).click();
    assert.equal(await tabs.nth(1).getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("[data-tab-panel]:visible").count(), 1);
    await tabs.nth(1).press("ArrowRight");
    assert.equal(await tabs.nth(2).getAttribute("aria-selected"), "true");
    await noOverflow();
    assert(await page.locator(".copy-code").count() > 0);
    await page.screenshot({ path: path.join(output, "article-desktop.png"), fullPage: false });

    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      for (const route of ["/", "/posts/", "/categories/", "/about/", "/posts/ethernaut-writeups/", "/posts/thesis-review-mission/", "/404.html"]) {
        await visit(route);
        await noOverflow();
        if (route === "/" && width < 761) {
          assert.equal(await page.locator(".analysis-tilt").evaluate((el) => getComputedStyle(el).transform), "none");
          assert.equal(await page.locator(".trace-flow").evaluate((el) => getComputedStyle(el).animationName), "none");
        }
        if (route === "/posts/thesis-review-mission/") {
          await page.locator("#nextSlide").click();
          assert.equal(await page.locator("#slideCounter").textContent(), "2 / 18");
          await page.locator("#prevSlide").click();
          assert.equal(await page.locator("#slideCounter").textContent(), "1 / 18");
        }
        if (route === "/" && width === 390) {
          await page.screenshot({ path: path.join(output, "home-mobile.png"), fullPage: true });
          await page.screenshot({ path: path.join(output, "home-mobile-first-screen.png"), fullPage: false });
        }
      }
    }
    const noJS = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const staticPage = await noJS.newPage();
    await staticPage.goto(base + "/");
    assert(await staticPage.locator(".case-link").isVisible());
    assert(await staticPage.locator(".trace-flow").isVisible());
    assert.equal(await staticPage.locator(".path-card:visible").count(), 3);
    await staticPage.goto(base + "/posts/");
    assert.equal(await staticPage.locator(".post-row:visible").count(), total);
    await staticPage.goto(base + "/posts/ethernaut-writeups/");
    assert.equal(await staticPage.locator("[data-tab-panel]:visible").count(), await staticPage.locator("[data-tab-panel]").count());
    await noJS.close();
    assert.deepEqual(errors, [], "Browser JavaScript errors");
    console.log(`PASS: ${total} entries, featured report/image, finite/reduced motion, newest-first order, search, theme persistence, tabs, no-JS content, desktop/mobile layouts.`);
  } finally {
    await browser.close();
    server.close();
  }
}
main().catch((error) => { console.error(error); server.close(); process.exitCode = 1; });
