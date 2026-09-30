import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || /hydration/i.test(message.text())) {
      problems.push(message.text());
    }
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

async function open(page: Page, path: string, heading: string | RegExp): Promise<string[]> {
  const problems = watchConsole(page);
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.locator('main h1')).toHaveText(heading);
  await expect(page.getByText('Could not load')).toHaveCount(0);
  return problems;
}

test('today shows who is in the wilds, the last save and the latest lines', async ({ page }) => {
  const problems = await open(page, '/', '4 adventurers in the wilds');
  const roster = page.locator('section', { hasText: 'In the wilds' });
  for (const name of ['Juniper', 'Orrin', 'Tamsin', 'Wren']) {
    await expect(roster.getByRole('link', { name })).toBeVisible();
  }
  await expect(roster.getByText('from the log')).toBeVisible();
  await expect(
    page
      .locator('section', { has: page.getByRole('heading', { name: 'Last save' }) })
      .getByText('from the last save')
  ).toBeVisible();
  await expect(page.locator('main li[data-type]').first()).toBeVisible();
  await expect(page.getByRole('list', { name: 'Activity feed' })).toHaveAttribute(
    'aria-live',
    'polite'
  );
  await expect(page.getByText('live', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Skip to the page' })).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('the in-game clock runs on today, in the strip, on the world page and in the overlay', async ({
  page
}) => {
  const problems = await open(page, '/', '4 adventurers in the wilds');
  const timer = page.locator('#clock').getByRole('timer');
  await expect(timer).toHaveAttribute(
    'aria-label',
    /^In-game clock: Day \d+, \d\d:\d\d, (Night|Morning|Afternoon|Evening), (Dawn|Nightfall) in \d+ (s|min)$/
  );
  const strip = page.locator('[data-clock]');
  await expect(strip).toHaveText(/^Day \d+ · \d\d:\d\d$/);
  await expect(strip).toHaveAttribute('aria-live', 'off');
  const first = await timer.getAttribute('aria-label');
  await expect.poll(() => timer.getAttribute('aria-label'), { timeout: 5_000 }).not.toBe(first);
  await page.goto('/world');
  await expect(page.locator('#clock').getByRole('timer')).toBeVisible();
  await expect(page.getByText('Time of day')).toHaveCount(0);
  await page.goto('/watch?size=300');
  await expect(page.locator('html')).toHaveAttribute('data-watch', '');
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByLabel('In the wilds').getByText('Juniper')).toBeVisible();
  await expect(page.locator('header')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('remote observations show polling cadence and freshness without a live label', async ({
  page
}) => {
  const status = JSON.parse(
    readFileSync(new URL('../../fixtures/api/status.json', import.meta.url), 'utf8')
  );
  status.collector.remote = {
    logs_poll_s: 5,
    saves_poll_s: 30,
    logs_checked_at: status.updated_at,
    saves_checked_at: status.updated_at
  };
  await page.addInitScript((status) => {
    class PolledStream extends EventTarget {
      constructor() {
        super();
        setTimeout(() => {
          this.dispatchEvent(new Event('open'));
          this.dispatchEvent(new MessageEvent('status', { data: JSON.stringify(status) }));
        }, 20);
      }
      close() {}
    }
    window.EventSource = PolledStream as unknown as typeof EventSource;
  }, status);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/world');
  await expect(page.getByText('Polled', { exact: true })).toBeVisible();
  await expect(page.getByText('live', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Remote logs: checked every 5 seconds/)).toBeVisible();
  await expect(page.getByText(/Remote saves: checked every 30 seconds/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('players sort through the query string and open their page with the skill grid', async ({
  page
}) => {
  const problems = await open(page, '/players', 'Players');
  await expect(page.locator('main tbody tr')).not.toHaveCount(0);
  await page.getByRole('link', { name: 'Deaths', exact: true }).click();
  await expect(page).toHaveURL(/sort=deaths/);
  await page.locator('main tbody tr').first().getByRole('link').first().click();
  await expect(page.locator('main h1')).not.toHaveText('Players');
  const skills = page.getByRole('list', { name: 'Skills' });
  await expect(skills.locator('li')).toHaveCount(12);
  await expect(skills.getByText('xp').first()).toBeVisible();
  await expect(
    page.locator('section', { hasText: 'Skills' }).getByText('from the last save').first()
  ).toBeVisible();
  await expect(page.getByText('Sessions', { exact: true }).first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('activity, chat and the world page render', async ({ page }) => {
  let problems = await open(page, '/activity', 'Activity');
  await page.getByRole('link', { name: 'Discoveries', exact: true }).click();
  await expect(page).toHaveURL(/types=journal\.unlocked/);
  await expect(page.locator('main li[data-type="journal.unlocked"]').first()).toBeVisible();
  expect(problems).toEqual([]);
  problems = await open(page, '/chat', 'Chat');
  await expect(page.locator('main li').first()).toBeVisible();
  expect(problems).toEqual([]);
  problems = await open(page, '/world', 'magpie-test');
  await expect(page.getByText('Weather by region')).toBeVisible();
  await page.getByText('Saved discoveries', { exact: true }).click();
  await expect(page.getByText('Lodestone · 2 saved characters', { exact: true })).toBeVisible();
  await expect(page.getByText('What this site can see')).toBeVisible();
  expect(problems).toEqual([]);
});

test('the admin pages open after logging in', async ({ page }) => {
  const problems = watchConsole(page);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.getByLabel('Password').fill('anything');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('main h1')).toHaveText('Site health');
  for (const [link, heading] of [
    ['Players', 'Players'],
    ['Raw events', 'Raw events'],
    ['Collector', 'Collector'],
    ['Settings', 'Settings']
  ] as const) {
    await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: link }).click();
    await expect(page.locator('main h1')).toHaveText(heading);
  }
  expect(problems).toEqual([]);
});

test('an unknown address says nothing is on this branch', async ({ page }) => {
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
  await expect(page.locator('main h1')).toHaveText('Nothing on this branch');
});

test('demo scenery preference survives reloads and navigation', async ({ page }) => {
  const problems = await open(page, '/', '4 adventurers in the wilds');
  await expect(page.getByRole('complementary', { name: 'Demo mode' })).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Scenery on' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(page.locator('.today-art')).toBeHidden();
  await expect(page.locator('.backdrop')).toBeHidden();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Scenery off' })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  await page
    .getByRole('navigation', { name: 'Site', exact: true })
    .getByRole('link', { name: 'World' })
    .click();
  await expect(page.locator('.backdrop')).toBeHidden();
  await page.getByRole('button', { name: 'Scenery off' }).click();
  await expect(page.locator('.backdrop')).toBeVisible();
  expect(problems).toEqual([]);
});

test('saved scenery is applied before JavaScript runs', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await context.addCookies([
      { name: 'magpie-scenery', value: 'off', url: 'http://localhost:5190' }
    ]);
    const page = await context.newPage();
    await page.goto('http://localhost:5190');
    await expect(page.locator('main h1')).toHaveText('4 adventurers in the wilds');
    await expect(page.locator('.today-art')).toBeHidden();
    await expect(page.locator('.backdrop')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Scenery off' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  } finally {
    await context.close();
  }
});

for (const [device, viewport] of [
  ['desktop', { width: 1440, height: 1000 }],
  ['phone', { width: 390, height: 844 }]
] as const) {
  test(`scenery waits for hydration with unavailable preference storage on ${device}`, async ({
    page
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      Object.defineProperty(document, 'cookie', {
        get() {
          return '';
        },
        set() {
          throw new DOMException('Unavailable', 'SecurityError');
        }
      });
    });
    const scripts = Promise.withResolvers<void>();
    await page.route('**/*', async (route) => {
      if (route.request().resourceType() === 'script') await scripts.promise;
      await route.continue();
    });
    const problems = watchConsole(page);
    try {
      const response = await page.goto('/', { waitUntil: 'commit' });
      expect(response?.status()).toBe(200);
      await expect(page.locator('main h1')).toHaveText('4 adventurers in the wilds');
      await expect(page.getByRole('button', { name: 'Scenery on' })).toBeDisabled();
      await expect(page.locator('.today-art')).toBeVisible();
    } finally {
      scripts.resolve();
    }
    await page.getByRole('button', { name: 'Scenery on' }).click();
    await expect(page.locator('.today-art')).toBeHidden();
    await expect(page.locator('.backdrop')).toBeHidden();
    await page.getByRole('button', { name: 'Scenery off' }).click();
    await expect(page.locator('.today-art')).toBeVisible();
    await expect(page.locator('.backdrop')).toBeVisible();
    expect(problems).toEqual([]);
  });
}
