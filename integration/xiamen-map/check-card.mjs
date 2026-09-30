import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PULSE_PLAYWRIGHT
  ? pathToFileURL(process.env.PULSE_PLAYWRIGHT).href : "playwright");
const url = process.argv[2] || "http://127.0.0.1:5291/#knowledge";
const out = `outputs/travel-map-cards/${process.argv[3] || "local"}`;
const maps = [
  { title: "厦门 3D 地图", destination: "https://xiamen-3d-map.wozhe0196.chatgpt.site/" },
  { title: "潮汕 3D 地图", destination: "https://chaoshan-3d-map.wozhe0196.chatgpt.site/" },
];
const report = { url, errors: [], previews: [], views: [], links: [] };
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(error.message));
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  assert.equal(response.status(), 200);
  const cards = page.locator(".knowledge-maps .knowledge-map-card");
  await cards.first().waitFor({ state: "visible", timeout: 60000 });
  assert.equal(await cards.count(), maps.length);
  assert.equal(await page.locator(".knowledge-feature").count(), 4);
  assert.equal(await page.locator(".knowledge-primary").getAttribute("href"), "https://lingan-library.wozhe0196.chatgpt.site/");
  for (const [index, map] of maps.entries()) {
    const card = cards.nth(index);
    assert.equal(await card.getAttribute("href"), map.destination);
    assert.equal(await card.getAttribute("target"), "_blank");
    assert.ok((await card.getAttribute("rel")).includes("noopener"));
    assert.equal(await card.locator("h2").textContent(), map.title);
    const preview = await card.locator("img").evaluate(async image => {
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 120; canvas.height = 80;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data, colors = new Set();
      for (let i = 0; i < data.length; i += 4) colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
      return { width: image.naturalWidth, height: image.naturalHeight, colors: colors.size };
    });
    assert.equal(preview.width, 1200);
    assert.equal(preview.height, 800);
    assert.ok(preview.colors > 100, "actual rendered map image, not a blank preview");
    report.previews.push({ title: map.title, ...preview });
  }
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    const boxes = [];
    for (let index = 0; index < maps.length; index++) {
      const card = cards.nth(index);
      await card.scrollIntoViewIfNeeded();
      const box = await card.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1, "card stays within the screen");
      const imageBox = await card.locator("img").boundingBox(), copyBox = await card.locator(".knowledge-map-copy").boundingBox();
      assert.ok(Math.abs(imageBox.width / imageBox.height - 1.5) < 0.01, "whole preview retains its aspect ratio");
      if (width < 850) assert.ok(imageBox.y + imageBox.height <= copyBox.y + 1, "mobile image cannot overlap text");
      assert.equal(await card.locator("img").evaluate(image => getComputedStyle(image).objectFit), "contain");
      boxes.push({ title: maps[index].title, box });
      await card.screenshot({ path: `${out}/${width}-map-${index}.png` });
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.screenshot({ path: `${out}/${width}.png`, fullPage: true });
    report.views.push({ width, height, cards: boxes });
  }
  await page.evaluate(() => { document.documentElement.dataset.pulseTheme = "dark"; });
  await page.screenshot({ path: `${out}/dark.png`, fullPage: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [index, map] of maps.entries()) {
      const card = cards.nth(index);
      await card.focus();
      assert.equal(await card.evaluate(node => document.activeElement === node), true);
      for (const selector of ["img", ".knowledge-map-action"]) {
        const opened = context.waitForEvent("page");
        await card.locator(selector).click();
        const popup = await opened;
        await popup.waitForURL(map.destination, { timeout: 60000 });
        assert.equal(popup.url(), map.destination);
        await popup.close();
        report.links.push({ width, title: map.title, selector, destination: map.destination });
      }
    }
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log(JSON.stringify(report));
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
