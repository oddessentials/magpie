import { spawn } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const appUrl = 'http://127.0.0.1:5192';
const siteUrl = 'http://127.0.0.1:5193';
const children = [];

function start(args, cwd, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  child.on('error', (error) => {
    output += error.message;
  });
  children.push(child);
  return { child, output: () => output };
}

async function ready(url, process) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (process.child.exitCode !== null) throw new Error(process.output());
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      await new Promise((done) => setTimeout(done, 500));
      continue;
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`Could not start ${url}: ${process.output()}`);
}

let browser;
try {
  const app = start(
    [
      file('node_modules/vite/bin/vite.js'),
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      '5192',
      '--strictPort'
    ],
    file('web'),
    { API_MOCK: '1', DATABASE_URL: 'postgresql://magpie:magpie@localhost:5432/magpie' }
  );
  const site = start([file('scripts/preview-site.mjs')], root, { SITE_PORT: '5193' });
  await Promise.all([ready(`${appUrl}/api/v1/health`, app), ready(siteUrl, site)]);
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    timezoneId: 'UTC'
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  async function open(url) {
    const response = await page.goto(url);
    if (!response?.ok()) throw new Error(`Failed to open ${url}`);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images]
          .filter((image) => image.loading !== 'lazy')
          .map((image) => image.decode())
      );
    });
  }
  async function capture(name) {
    await page.screenshot({
      path: file(`site/assets/${name}.jpg`),
      type: 'jpeg',
      quality: 88,
      animations: 'disabled'
    });
    console.log(`Captured site/assets/${name}.jpg`);
  }
  await open(appUrl);
  await page.getByText('live', { exact: true }).waitFor();
  const player = await page.locator('main a[href^="/players/"]').first().getAttribute('href');
  await capture('today');
  for (const [name, path] of [
    ['player', player],
    ['activity', '/activity'],
    ['world', '/world']
  ]) {
    await open(`${appUrl}${path}`);
    await page.getByText('live', { exact: true }).waitFor();
    await capture(name);
  }
  await page.setViewportSize({ width: 1600, height: 800 });
  await open(siteUrl);
  await page.addStyleTag({
    content:
      '.hero .wrap { min-height: 700px; } .hero .actions { display: none; } .hero .hero-footnote { margin-top: 2rem; }'
  });
  await page
    .locator('.hero')
    .screenshot({ path: file('site/assets/banner.jpg'), type: 'jpeg', quality: 90 });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.addStyleTag({
    content:
      '.hero .wrap { min-height: 630px; padding-block: 2rem; } .hero-copy { width: 57%; } .hero .actions, .art-note { display: none; } .hero h1 { font-size: 100px; } .hero .hero-footnote { margin-top: 2rem; }'
  });
  const social = await page.locator('.hero').screenshot();
  await sharp(social)
    .resize(1200, 630)
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(file('site/assets/social.jpg'));
  copyFileSync(file('site/assets/social.jpg'), file('web/static/social.jpg'));
  copyFileSync(file('site/assets/social.jpg'), file('art/raster/social-1200.jpg'));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Captured banner and social card.');
} finally {
  await browser?.close();
  for (const child of children) child.kill();
}
