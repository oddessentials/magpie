import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { dialPreview, previewNames, previewVariants } from '../art/presentation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const appUrl = 'http://127.0.0.1:5192';
const siteUrl = 'http://127.0.0.1:5193';
const instant = JSON.parse(readFileSync(file('web/fixtures/api/status.json'), 'utf8')).updated_at;
const captureTime = Date.parse(instant);
assert.ok(Number.isFinite(captureTime), 'The status fixture needs a valid capture time.');
const clockModule = `data:text/javascript,${encodeURIComponent(`Date.now = () => ${captureTime};`)}`;
const local = file('local');
mkdirSync(local, { recursive: true });
const staging = mkdtempSync(join(local, 'presentation-'));
const children = [];
const captures = [];

function start(args, cwd, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env, NO_COLOR: '1', FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let output = '';
  let failure;
  const append = (data) => {
    output = (output + data).slice(-16000);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('error', (error) => {
    failure = error;
  });
  children.push(child);
  return {
    child,
    assertRunning() {
      if (failure) throw failure;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(output);
    },
    output: () => output
  };
}

async function ready(url, ownedProcess) {
  for (let attempt = 0; attempt < 120; attempt++) {
    ownedProcess.assertRunning();
    if (ownedProcess.output().includes(new URL(url).origin)) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          ownedProcess.assertRunning();
          return;
        }
      } catch {
        ownedProcess.assertRunning();
      }
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`Could not start ${url}: ${ownedProcess.output()}`);
}

async function stage(name, buffer, width, height, destinations = [`site/assets/${name}`]) {
  const metadata = await sharp(buffer).metadata();
  const formats = { '.jpg': 'jpeg', '.avif': 'heif', '.webp': 'webp' };
  assert.equal(metadata.format, formats[extname(name)], `${name} format`);
  if (extname(name) === '.avif') assert.equal(metadata.compression, 'av1', `${name} codec`);
  assert.equal(metadata.width, width, `${name} width`);
  assert.equal(metadata.height, height, `${name} height`);
  await sharp(buffer).raw().toBuffer();
  const source = join(staging, name);
  writeFileSync(source, buffer);
  captures.push({ source, destinations });
  console.log(`Validated ${name} (${width} × ${height})`);
}

let browser;
try {
  const app = start(
    [
      '--import',
      clockModule,
      file('node_modules/vite/bin/vite.js'),
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      '5192',
      '--strictPort'
    ],
    file('web'),
    {
      API_MOCK: '1',
      API_BASE_URL: '',
      PUBLIC_SITE_NAME: '',
      DATABASE_URL: 'postgresql://magpie:magpie@localhost:5432/magpie',
      TZ: 'UTC'
    }
  );
  const site = start([file('scripts/preview-site.mjs')], root, { SITE_PORT: '5193' });
  await Promise.all([ready(`${appUrl}/api/v1/health`, app), ready(siteUrl, site)]);
  const status = await (await fetch(`${appUrl}/api/v1/status`)).json();
  assert.equal(status.updated_at, instant, 'The fixture clock must be fixed before capture.');
  browser = await chromium.launch();
  const errors = [];
  async function createPage(viewport, deviceScaleFactor = 1) {
    const page = await browser.newPage({
      viewport,
      deviceScaleFactor,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      timezoneId: 'UTC',
      locale: 'en-US'
    });
    await page.clock.setFixedTime(captureTime);
    await page.addInitScript(() => {
      const frozen = performance.now();
      performance.now = () => frozen;
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' || /hydration/i.test(message.text()))
        errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    return page;
  }
  async function open(page, url, appPage = false) {
    const response = await page.goto(url);
    assert.ok(response?.ok(), `Failed to open ${url}`);
    const attribution =
      "Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.";
    const rendered = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    assert.equal(
      rendered.split(attribution).length - 1,
      1,
      'The attribution must render exactly once.'
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images]
          .filter((image) => image.loading !== 'lazy')
          .map((image) => image.decode())
      );
    });
    if (appPage) {
      await page.getByRole('complementary', { name: 'Demo mode' }).waitFor();
      await page.getByText('live', { exact: true }).waitFor();
      assert.equal(await page.getByText('Could not load', { exact: false }).count(), 0);
    }
  }
  const desktop = await createPage({ width: 1440, height: 1080 });
  await open(desktop, appUrl, true);
  const player = await desktop.locator('main a[href^="/players/"]').first().getAttribute('href');
  assert.match(player ?? '', /^\/players\/\d+$/);
  const views = [
    ['today', '/'],
    ['player', player],
    ['activity', '/activity'],
    ['world', '/world'],
    ['map', '/map?layers=spawns,dungeons,shrines'],
    ['ledger', '/ledger?plan=i:ITEM_Pickaxe_Bronze*2,b:BUILDPIECE_ProcessingStation_Smelter*1'],
    ['journal', '/journal'],
    ['progression', '/progression']
  ];
  async function settle(page, name) {
    if (name === 'ledger') {
      await page.getByRole('heading', { name: 'Craft' }).waitFor();
    }
    if (name === 'map') {
      await page.locator('path.spots').first().waitFor();
      await page.waitForFunction(() => !document.body.innerText.includes('loading…'));
    }
    if (name === 'player') {
      await page
        .getByRole('combobox', { name: /^Skill/ })
        .and(page.locator(':enabled'))
        .waitFor();
    }
    await page.evaluate(() => document.fonts.ready);
  }
  for (const [name, path] of views) {
    await open(desktop, `${appUrl}${path}`, true);
    await settle(desktop, name);
    await stage(
      `${name}.jpg`,
      await desktop.screenshot({ type: 'jpeg', quality: 88, animations: 'disabled' }),
      1440,
      1080
    );
  }
  const closeup = await createPage({ width: 1440, height: 1080 }, 2);
  await open(closeup, `${appUrl}/`, true);
  await settle(closeup, 'today');
  const dial = await closeup.locator('#clock .sun-dial').boundingBox();
  assert.ok(dial && dial.width === 340, 'The dial must render at 340 px on a desktop.');
  await stage(
    'clock.jpg',
    await closeup.screenshot({
      type: 'jpeg',
      quality: 90,
      animations: 'disabled',
      clip: { x: Math.round(dial.x), y: Math.round(dial.y), width: 340, height: 340 }
    }),
    680,
    680
  );
  const mobile = await createPage({ width: 390, height: 1440 }, 2);
  for (const [name, path] of views) {
    await open(mobile, `${appUrl}${path}`, true);
    await settle(mobile, name);
    assert.equal(
      await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `${name} must fit a phone screen`
    );
    await stage(
      `${name}-mobile.jpg`,
      await mobile.screenshot({ type: 'jpeg', quality: 88, animations: 'disabled' }),
      780,
      2880
    );
  }
  for (const [page, suffix] of [
    [desktop, 'map.jpg'],
    [mobile, 'map-mobile.jpg']
  ]) {
    await open(page, `${siteUrl}/demo.html#map`);
    await page.locator('#map:not([hidden])').waitFor();
    assert.equal(await page.locator('.tour-panel:not([hidden])').count(), 1);
    const selected = await page.locator('#map img').evaluate(async (img) => {
      await img.decode();
      return img.currentSrc;
    });
    assert.ok(selected.endsWith(suffix));
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
  }
  const noScript = await browser.newPage({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 }
  });
  await open(noScript, `${siteUrl}/demo.html`);
  assert.equal(await noScript.locator('.tour-panel:not([hidden])').count(), views.length);
  assert.equal(await noScript.locator('#map').isVisible(), true);
  await noScript.close();
  await desktop.setViewportSize({ width: 1600, height: 800 });
  await open(desktop, siteUrl);
  await desktop.addStyleTag({
    content:
      '.hero .wrap { min-height: 700px; } .hero .actions { display: none; } .hero .hero-footnote { margin-top: 2rem; }'
  });
  await stage(
    'banner.jpg',
    await desktop.locator('.hero').screenshot({ type: 'jpeg', quality: 90 }),
    1600,
    700
  );
  await desktop.setViewportSize({ width: 1200, height: 800 });
  await desktop.addStyleTag({
    content:
      '.hero .wrap { min-height: 630px; padding-block: 2rem; } .hero-copy { width: 57%; } .hero .actions, .art-note { display: none; } .hero h1 { font-size: 100px; } .hero .hero-footnote { margin-top: 2rem; }'
  });
  const social = await sharp(await desktop.locator('.hero').screenshot())
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  await stage('social.jpg', social, 1200, 630, [
    'site/assets/social.jpg',
    'web/static/social.jpg',
    'art/raster/social-1200.jpg'
  ]);
  app.assertRunning();
  site.assertRunning();
  assert.deepEqual(errors, [], 'Capture pages must have no browser or asset errors.');
  assert.equal(captures.length, views.length * 2 + 3);
  for (const name of previewNames) {
    for (const variant of await previewVariants(join(staging, `${name}.jpg`), name)) {
      await stage(variant.name, variant.data, variant.width, variant.height);
    }
  }
  for (const variant of await previewVariants(
    join(staging, `${dialPreview.name}.jpg`),
    dialPreview.name,
    dialPreview.widths
  )) {
    await stage(variant.name, variant.data, variant.width, variant.height);
  }
  const outputs = captures.flatMap(({ source, destinations }) =>
    destinations.map((destination) => ({ source, target: file(destination) }))
  );
  if (process.argv.includes('--check')) {
    for (const { source, target } of outputs) {
      assert.ok(readFileSync(source).equals(readFileSync(target)), `Capture differs: ${target}`);
    }
    console.log('All presentation images reproduce exactly.');
  } else {
    const previous = outputs.map(({ target }) => ({
      target,
      contents: existsSync(target) ? readFileSync(target) : null
    }));
    try {
      for (const { source, target } of outputs) copyFileSync(source, target);
    } catch (error) {
      for (const { target, contents } of previous) {
        if (contents === null) rmSync(target, { force: true });
        else writeFileSync(target, contents);
      }
      throw error;
    }
    console.log('Published the complete validated presentation set.');
  }
} finally {
  await browser?.close();
  await Promise.all(
    children.map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    })
  );
  const cleanup = resolve(staging);
  assert.ok(cleanup.startsWith(resolve(local) + sep));
  rmSync(cleanup, { recursive: true, force: true });
}
