import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const label = process.argv[2] ?? 'baseline';
assert.match(label, /^[a-zA-Z0-9_-]+$/, 'Use a simple label for the measurement files.');
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
mkdirSync('local', { recursive: true });
const origin = 'http://127.0.0.1:5184';
const server = spawn(process.execPath, ['scripts/preview-site.mjs'], {
  env: { ...process.env, SITE_PORT: '5184' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});
let browser;
const results = [];
try {
  await once(server.stdout, 'data');
  browser = await chromium.launch();
  const profile = {
    browser: browser.version(),
    platform: process.platform,
    osRelease: release(),
    cpu: cpus()[0]?.model,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    downloadBytesPerSecond: 200000,
    uploadBytesPerSecond: 93750,
    latencyMs: 150,
    cpuSlowdown: 4,
    reducedMotion: 'reduce',
    cache: 'disabled, new browser context per run',
    server: 'local HTTP static preview, no compression',
    durationMs: 10000
  };
  for (const path of ['/', '/demo.html']) {
    for (let run = 1; run <= 3; run++) {
      const context = await browser.newContext({
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor,
        isMobile: true,
        hasTouch: true,
        reducedMotion: 'reduce'
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: profile.latencyMs,
        downloadThroughput: profile.downloadBytesPerSecond,
        uploadThroughput: profile.uploadBytesPerSecond,
        connectionType: 'cellular4g'
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });
      await page.addInitScript(() => {
        window.measurement = { lcp: [], shifts: [], cls: 0 };
        let windowStart = 0;
        let lastShift = 0;
        let windowScore = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            window.measurement.lcp.push({
              at: e.startTime,
              size: e.size,
              url: e.url,
              element: e.element?.outerHTML.slice(0, 800)
            });
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            if (!e.hadRecentInput) {
              if (e.startTime - lastShift >= 1000 || e.startTime - windowStart >= 5000) {
                windowStart = e.startTime;
                windowScore = 0;
              }
              lastShift = e.startTime;
              windowScore += e.value;
              window.measurement.cls = Math.max(window.measurement.cls, windowScore);
              window.measurement.shifts.push({ at: e.startTime, value: e.value });
            }
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(profile.durationMs);
      const data = await page.evaluate(() => ({
        ...window.measurement,
        resources: performance.getEntriesByType('resource').map((e) => ({
          name: e.name.split('/').at(-1),
          start: e.startTime,
          responseStart: e.responseStart,
          end: e.responseEnd,
          bytes: e.transferSize,
          initiator: e.initiatorType
        })),
        images: [...document.images].map((i) => ({
          src: i.currentSrc.split('/').at(-1),
          natural: [i.naturalWidth, i.naturalHeight],
          rendered: [i.width, i.height],
          loading: i.loading,
          top: i.getBoundingClientRect().top
        })),
        fonts: [...document.fonts].map((f) => ({ family: f.family, status: f.status })),
        attributionCount:
          document.body.innerText
            .replace(/\s+/g, ' ')
            .split(
              "Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex."
            ).length - 1,
        overflow: document.documentElement.scrollWidth > innerWidth
      }));
      assert.equal(data.attributionCount, 1);
      assert.equal(data.overflow, false);
      results.push({ path, run, ...data });
      console.log(
        JSON.stringify({
          path,
          run,
          lcp: data.lcp.at(-1),
          cls: data.cls
        })
      );
      if (run === 1)
        await page.screenshot({
          path: `local/${label}-${path === '/' ? 'index' : 'demo'}-mobile.png`
        });
      await context.close();
    }
  }
  writeFileSync(`local/mobile-${label}.json`, JSON.stringify({ profile, results }, null, 2));
  assert.ok(
    results.every((result) => result.lcp.at(-1)?.at < 2500),
    'Every measured LCP must be below 2.5 seconds.'
  );
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const stopped = once(server, 'exit');
    server.kill();
    await stopped;
  }
}
