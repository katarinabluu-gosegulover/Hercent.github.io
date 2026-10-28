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
      if (response) assert.equal(response.status(), 200, route);
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
    assert.equal(await page.locator('.map-node').count(), 8);
    assert.equal(await page.locator('.terminal-profile .profile-facts > div').count(), 3);
    assert((await page.locator('.terminal-profile .profile-identity img').getAttribute('src')).startsWith('https://github.com/katarinabluu-gosegulover.png'));
    const mapCounts = await page.locator('.map-node-copy > span').allTextContents();
    assert.equal(mapCounts.reduce((sum, text) => sum + (parseInt(text, 10) || 0), 0), 41);
    for (const href of await page.locator('.map-node').evaluateAll(nodes => nodes.map(node => node.href))) {
      assert.equal((await context.request.get(href)).status(), 200, 'Map category link');
    }
    await page.locator('.research-map-section').screenshot({ path: path.join(output, 'research-map-desktop.png') });
    await page.locator('.terminal-profile').screenshot({ path: path.join(output, 'terminal-profile.png') });
    await page.locator('[data-theme-toggle]').click();
    await page.locator('.research-map-section').screenshot({ path: path.join(output, 'research-map-light.png') });
    await page.locator('[data-theme-toggle]').click();
    assert.equal(await page.locator(".note-row").count(), 6);
    assert.equal(await page.locator(".research-timeline .post-cover-compact svg").count(), 6);
    assert.equal(await page.locator('.report-companion').count(), 2);
    const companionLinks = await page.locator('.companion-link').evaluateAll(nodes => nodes.map(node => node.href));
    assert.equal(new Set(companionLinks).size, 2);
    for (const href of companionLinks) {
      assert.notEqual(href, await page.locator('.case-link').evaluate(node => node.href));
      assert.equal((await context.request.get(href)).status(), 200, 'Companion article link');
    }
    assert.equal(await page.locator(".research-timeline .note-row").count(), 6);
    assert.equal(await page.locator(".research-timeline .field-badge .field-icon").count(), 6);
    const timelineDates = await page.locator(".research-timeline time").evaluateAll((els) => els.map((el) => el.dateTime));
    assert.deepEqual(timelineDates, [...timelineDates].sort().reverse());
    await page.locator(".latest-notes").screenshot({ path: path.join(output, "research-timeline.png") });
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
    await page.waitForFunction(() => document.querySelector('[data-analysis-stage]').classList.contains('ambient-running'));
    const motion = await page.locator(".hero-signal").evaluate((el) => {
      const css = getComputedStyle(el);
      return { name: css.animationName, iterations: css.animationIterationCount, duration: css.animationDuration };
    });
    assert.deepEqual(motion, { name: "signal-travel", iterations: "infinite", duration: "7s" });
    const signalOffset = await page.locator('.hero-signal').evaluate(el => getComputedStyle(el).strokeDashoffset);
    await page.waitForFunction(offset => getComputedStyle(document.querySelector('.hero-signal')).strokeDashoffset !== offset, signalOffset);
    await page.locator('.research-map').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => !document.querySelector('[data-analysis-stage]').classList.contains('ambient-running') && document.querySelector('.research-map').classList.contains('ambient-running'));
    assert.equal(await page.locator('.hero-signal').evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
    assert.equal(await page.locator('.map-signal').count(), 8);
    await page.locator('.map-node').nth(2).focus();
    assert.equal(await page.locator('.route-active').getAttribute('data-map-route'), '2');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.locator('.ambient-running').count(), 0, 'Background visibility pauses both regions');
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.locator('[data-motion-toggle]').last().click();
    assert.deepEqual(await page.locator('[data-motion-toggle]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-pressed'))), ['false', 'false']);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-motion-toggle]').first().getAttribute('aria-pressed'), 'false');
    assert(await page.locator('.hero-signal').isHidden());
    await page.locator('[data-motion-toggle]').first().click();
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForFunction(() => document.querySelector('[data-analysis-stage]').classList.contains('ambient-running'));
    assert.equal(await page.locator(".research-glyph").count(), 3);
    const stage = page.locator("[data-analysis-stage]");
    const bounds = await stage.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .3);
    assert.notEqual(await stage.evaluate((el) => el.style.getPropertyValue("--tilt-y")), "");
    await page.mouse.move(0, 0);
    assert.equal(await stage.evaluate((el) => el.style.getPropertyValue("--tilt-y")), "");
    await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .3);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() => document.querySelector('[data-motion-toggle]').disabled);
    assert(await page.locator('.hero-signal').isHidden());
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

    await page.emulateMedia({ reducedMotion: "no-preference" });
    const cursor = page.locator(".profile-identity .profile-cursor");
    const logoCursor = page.locator(".brand-symbol .profile-cursor");
    assert.equal(await logoCursor.evaluate((el) => getComputedStyle(el).animationName), "profile-blink");
    assert.equal(await logoCursor.evaluate((el) => getComputedStyle(el).animationDuration), "1.2s");
    assert.equal(await cursor.evaluate((el) => getComputedStyle(el).animationName), "profile-blink");
    await page.locator("[data-cursor-toggle]").click();
    assert.equal(await cursor.evaluate((el) => getComputedStyle(el).animationName), "none");
    assert.equal(await logoCursor.evaluate((el) => getComputedStyle(el).animationName), "none");
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await cursor.evaluate((el) => getComputedStyle(el).animationName), "none", "Cursor pause persists");
    assert.equal(await logoCursor.evaluate((el) => getComputedStyle(el).animationName), "none", "Logo pause persists");
    await page.locator("[data-cursor-toggle]").click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await cursor.evaluate((el) => getComputedStyle(el).animationName), "none");
    await page.waitForFunction(() => document.querySelector("[data-cursor-toggle]").disabled);
    assert(await page.locator("[data-cursor-toggle]").isDisabled());
    assert.equal(await logoCursor.evaluate((el) => getComputedStyle(el).animationName), "none", "Logo respects reduced motion");
    await page.keyboard.press("/");
    await page.waitForURL("**/posts/#post-search");
    await page.waitForFunction(() => document.activeElement === document.querySelector("[data-post-search]"));

    await visit("/posts/");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    assert.equal(await logoCursor.evaluate((el) => getComputedStyle(el).animationName), "profile-blink");
    await page.locator(".site-header [data-cursor-toggle]").click();
    assert.equal(await logoCursor.evaluate((el) => getComputedStyle(el).animationName), "none");
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await logoCursor.evaluate((el) => getComputedStyle(el).animationName), "none");
    await page.locator(".site-header [data-cursor-toggle]").click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const total = await page.locator(".post-row").count();
    assert(total > 30);
    const dates = await page.locator(".post-row .post-meta").allTextContents();
    assert.deepEqual(dates, [...dates].sort().reverse(), "Archive must be newest first");
    const hrefs = await page.locator(".post-row h2 a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    assert.equal(new Set(hrefs).size, total, "Each entry is listed exactly once");
    const search = page.locator("[data-post-search]");
    await page.keyboard.press("/");
    assert(await search.evaluate((el) => document.activeElement === el));
    await search.press("/");
    assert.equal(await search.inputValue(), "/", "Slash must remain normal input while typing");
    await search.evaluate((el) => el.blur());
    await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "/", isComposing: true, bubbles: true })));
    assert(await search.evaluate((el) => document.activeElement !== el), "Composition must not trigger search");
    await search.fill("fuzzing");
    const matching = await page.locator(".post-row:visible").count();
    assert(matching > 0 && matching < total);
    await search.fill("no-such-entry-357891");
    assert.equal(await page.locator(".post-row:visible").count(), 0);
    assert(await page.locator("[data-search-empty]").isVisible());
    await search.fill("");
    assert.equal(await page.locator(".post-row:visible").count(), total);
    await page.screenshot({ path: path.join(output, "archive-desktop.png"), fullPage: false });

    // Mock clipboard writes so tests never replace the user's system clipboard.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true, value: { writeText: async (text) => { window.__copiedCode = text; } }
      });
    });
    await visit("/posts/fuzzing-101-3-chall/");
    assert.equal(await page.locator('.post-cover').getAttribute('data-cover'), 'trace');
    await page.screenshot({ path: path.join(output, 'post-cover-desktop.png') });
    const zoom = page.locator('.image-zoom').first();
    await zoom.focus();
    await page.keyboard.press('Enter');
    const viewer = page.locator('.image-viewer');
    assert(await viewer.isVisible());
    assert(await viewer.locator('[data-prev]').isDisabled());
    await viewer.locator('img').evaluate(img => img.decode());
    const originalImage = await viewer.locator('img').getAttribute('src');
    await page.keyboard.press('ArrowRight');
    assert.notEqual(await viewer.locator('img').getAttribute('src'), originalImage);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await viewer.locator('img').getAttribute('src'), originalImage);
    await page.keyboard.press('/');
    assert(page.url().includes('/posts/fuzzing-101-3-chall/'));
    await page.keyboard.press('Tab');
    assert(await viewer.evaluate(el => el.contains(document.activeElement)), 'Modal retains keyboard focus');
    await page.screenshot({ path: path.join(output, 'image-viewer-desktop.png') });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.image-viewer').open && document.activeElement.classList.contains('image-zoom'));
    assert.notEqual(await page.locator('html').evaluate(el => el.style.overflow), 'hidden');
    await page.setViewportSize({ width: 390, height: 844 });
    await zoom.click();
    await noOverflow();
    await page.screenshot({ path: path.join(output, 'image-viewer-mobile.png') });
    await viewer.locator('[data-size]').click();
    assert.equal(await viewer.locator('[data-size]').getAttribute('aria-pressed'), 'true');
    assert(await viewer.locator('.viewer-stage').evaluate(el => el.scrollWidth > el.clientWidth));
    await viewer.locator('[data-size]').click();
    assert.equal(await viewer.locator('[data-size]').getAttribute('aria-pressed'), 'false');
    await viewer.locator('[data-close]').click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(await page.locator(".analysis-note").count(), 3);
    assert.deepEqual(await page.locator(".analysis-note").evaluateAll((els) => els.map((el) => el.dataset.note)), ["finding", "warning", "result"]);
    assert.equal(await page.locator('.analysis-note[data-note="finding"] a').getAttribute("href"), "https://nvd.nist.gov/vuln/detail/CVE-2019-13288");
    assert.equal(await page.locator('.analysis-note[data-note="result"] code').count(), 2);
    await page.locator('.analysis-note[data-note="warning"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, "analysis-notes-dark.png") });
    await page.locator("[data-theme-toggle]").click();
    await page.locator('.analysis-note[data-note="warning"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, "analysis-notes-light.png") });
    await page.locator("[data-theme-toggle]").click();
    assert(await page.locator("[data-reading-sidebar]").isVisible());
    const headingCount = await page.locator(".article-body h2,.article-body h3").count();
    assert.equal(await page.locator("[data-toc-list] a").count(), headingCount);
    const tocLink = page.locator("[data-toc-list] a").nth(1);
    const targetHash = await tocLink.getAttribute("href");
    await tocLink.click();
    await page.waitForFunction((hash) => document.querySelector("[data-toc-list] a[aria-current]")?.getAttribute("href") === hash, targetHash);
    await page.evaluate(() => {
      const body = document.querySelector(".article-body");
      scrollTo({ top: body.getBoundingClientRect().bottom + scrollY - innerHeight + 2, behavior: "instant" });
    });
    await page.waitForFunction(() => document.querySelector("[data-reading-progress]").getAttribute("aria-valuenow") === "100");
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForFunction(() => document.querySelector("[data-reading-progress]").getAttribute("aria-valuenow") === "0");
    const codeBlock = page.locator(".code-block").first();
    assert.equal(await codeBlock.locator(".code-language").textContent(), "Bash");
    const codeText = await codeBlock.locator("pre").textContent();
    await codeBlock.locator(".copy-code").click();
    await page.waitForFunction(() => document.querySelector(".copy-code").textContent === "복사 완료");
    assert.equal(await page.evaluate(() => window.__copiedCode), codeText);
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error("Clipboard denied"); }; });
    await codeBlock.locator(".copy-code").click();
    await page.waitForFunction(() => document.querySelector(".copy-code").textContent.includes("복사 실패"));
    const relatedLinks = await page.locator(".related-card").evaluateAll((links) => links.map((link) => link.href));
    assert(relatedLinks.length > 0 && relatedLinks.length <= 3);
    for (const href of relatedLinks) {
      assert.notEqual(new URL(href).pathname, new URL(page.url()).pathname);
      assert.equal((await context.request.get(href)).status(), 200);
    }
    await noOverflow();
    await page.waitForFunction(() => document.querySelector(".copy-code").textContent === "코드 복사");
    await page.screenshot({ path: path.join(output, "reading-desktop.png"), fullPage: false });

    await visit("/posts/ethernaut-writeups/");
    const tabs = page.locator("[data-tab-trigger]");
    await tabs.nth(1).click();
    assert.equal(await tabs.nth(1).getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("[data-tab-panel]:visible").count(), 1);
    await tabs.nth(1).press("ArrowRight");
    assert.equal(await tabs.nth(2).getAttribute("aria-selected"), "true");
    assert(await page.locator("[data-toc-list] a").evaluateAll((links) => links.every((link) => {
      const heading = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      return heading && !heading.closest("[hidden]");
    })), "TOC must only include the visible tab");
    const ids = await page.locator(".article-body h2,.article-body h3").evaluateAll((headings) => headings.map((heading) => heading.id));
    assert.equal(new Set(ids).size, ids.length, "Unique heading anchors across tabs");
    const deepHeading = await page.locator("[data-tab-panel]:not([hidden]) h2").first().getAttribute("id");
    await tabs.nth(1).click();
    await visit(`/posts/ethernaut-writeups/#${encodeURIComponent(deepHeading)}`);
    await page.waitForFunction((id) => {
      const heading = document.getElementById(id);
      const offset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) + parseFloat(getComputedStyle(heading).scrollMarginTop);
      return !heading.closest("[hidden]") && Math.abs(heading.getBoundingClientRect().top - offset) < 3;
    }, deepHeading);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await tabs.nth(2).getAttribute("aria-selected"), "true", "Heading deep link restores tab");
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
        if (route === "/posts/ethernaut-writeups/" && width === 390) {
          assert.equal(await page.locator("[data-reading-toc]").getAttribute("open"), null);
          await page.locator("[data-reading-toc] summary").click();
          assert(await page.locator("[data-toc-list] a").first().isVisible());
          const mobileHeadingId = decodeURIComponent((await page.locator("[data-toc-list] a").first().getAttribute("href")).slice(1));
          await page.locator("[data-toc-list] a").first().click();
          await page.waitForFunction((id) => {
            const heading = document.getElementById(id);
            const offset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) + parseFloat(getComputedStyle(heading).scrollMarginTop);
            return Math.abs(heading.getBoundingClientRect().top - offset) < 3;
          }, mobileHeadingId);
          await noOverflow();
          await page.screenshot({ path: path.join(output, "reading-mobile.png"), fullPage: false });
        }
        if (route === "/" && width === 390) {
          assert.equal(await page.locator('.map-node:visible').count(), 8);
          assert(await page.locator('.map-wires').isHidden());
          await page.locator('.research-map-section').screenshot({ path: path.join(output, 'research-map-mobile.png') });
          await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
          await page.screenshot({ path: path.join(output, "home-mobile.png"), fullPage: true });
          await page.screenshot({ path: path.join(output, "home-mobile-first-screen.png"), fullPage: false });
        }
      }
    }
    const noJS = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const staticPage = await noJS.newPage();
    await staticPage.goto(base + "/");
    assert(await staticPage.locator(".case-link").isVisible());
    assert.equal(await staticPage.locator('.map-node:visible').count(), 8);
    assert(await staticPage.locator('.terminal-profile').isVisible());
    assert(await staticPage.locator(".trace-flow").isVisible());
    assert(await staticPage.locator('.hero-signal').isHidden());
    assert(await staticPage.locator('[data-motion-toggle]').first().isHidden());
    assert.equal(await staticPage.locator(".path-card:visible").count(), 3);
    await staticPage.goto(base + "/posts/");
    assert.equal(await staticPage.locator(".post-row:visible").count(), total);
    await staticPage.goto(base + "/posts/ethernaut-writeups/");
    assert.equal(await staticPage.locator("[data-tab-panel]:visible").count(), await staticPage.locator("[data-tab-panel]").count());
    assert(await staticPage.locator("[data-reading-sidebar]").isHidden());
    assert(await staticPage.locator("[data-reading-progress]").isHidden());
    assert(await staticPage.locator(".related-card").count() > 0);
    await staticPage.goto(base + "/posts/fuzzing-101-3-chall/");
    assert.equal(await staticPage.locator(".analysis-note:visible").count(), 3);
    assert.equal(await staticPage.locator('.post-cover svg').count(), 1);
    assert.equal(await staticPage.locator('.image-zoom').count(), 0);
    assert(await staticPage.locator('.article-body img').count() > 0);
    assert.equal(await staticPage.locator(".field-badge:visible").count(), 1);
    await noJS.close();
    assert.deepEqual(errors, [], "Browser JavaScript errors");
    console.log(`PASS: ${total} entries, category badges, timeline, analysis notes, palette contrast, graphics, TOC/deep links, reading progress, code headers/copy, related posts, slash search, cursor preferences, no-JS and responsive layouts.`);
  } finally {
    await browser.close();
    server.close();
  }
}
main().catch((error) => { console.error(error); server.close(); process.exitCode = 1; });
