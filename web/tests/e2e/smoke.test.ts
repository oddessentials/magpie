import { expect, test, type Page } from '@playwright/test';

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
    page.locator('section', { hasText: 'Last save' }).getByText('from the last save')
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
