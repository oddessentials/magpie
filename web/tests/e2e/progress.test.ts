import { expect, test, type Page } from '@playwright/test';

const attribution =
  "Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.";

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || /hydration/i.test(message.text()))
      problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  expect(body.split(attribution)).toHaveLength(2);
}

for (const viewport of [
  { width: 1440, height: 1080 },
  { width: 390, height: 844 }
]) {
  test(`progression compares every adventurer at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const problems = watch(page);
    await page.goto('/progression');
    await expect(page.locator('main h1')).toHaveText('Progression');
    await expect(
      page.getByRole('list', { name: 'Adventurers' }).locator(':scope > li')
    ).toHaveCount(6);
    await expect(page.getByRole('meter', { name: 'Journal' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Quests by area' })).toBeVisible();
    await expect(page.getByText('General Velgar', { exact: true }).last()).toBeVisible();
    await fits(page);
    expect(problems).toEqual([]);
  });

  test(`the journal filters by player, status and name at ${viewport.width}px`, async ({
    page
  }) => {
    await page.setViewportSize(viewport);
    const problems = watch(page);
    await page.goto('/journal');
    await expect(page.locator('main h1')).toHaveText('Journal');
    const tabs = page.getByRole('navigation', { name: 'Journal categories' });
    await expect(tabs.getByRole('button', { name: /^World/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
    const show = page.getByRole('combobox', { name: /^Show/ });
    await expect(show).toBeEnabled();
    await show.selectOption('missing');
    await page.getByLabel('Search entries').fill('Imaru');
    await expect(
      page.locator('main li[data-found="false"]', { hasText: 'Imaru' }).first()
    ).toBeVisible();
    await expect(page).toHaveURL(/show=missing/);
    const link = page.getByRole('link', { name: /Show on the map/ }).first();
    await expect(link).toHaveAttribute('href', /\/map\?find=creature%3A/);
    await tabs.getByRole('button', { name: /^Recipes/ }).focus();
    await page.keyboard.press('Enter');
    await expect(tabs.getByRole('button', { name: /^Recipes/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
    await page.getByLabel('Search entries').fill('');
    await page.getByRole('combobox', { name: /^Whose journal/ }).selectOption({ label: 'Juniper' });
    await expect(page).toHaveURL(/category=Recipes/);
    await expect(page.getByText(/^Pick up /).first()).toBeVisible();
    await fits(page);
    expect(problems).toEqual([]);
  });

  test(`the ledger plans from the group's stock at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const problems = watch(page);
    await page.goto('/ledger');
    await expect(page.locator('main h1')).toHaveText('Ledger');
    const search = page.getByLabel('Add to the plan');
    await expect(search).toBeEnabled({ timeout: 15_000 });
    await search.fill('Bronze Pickaxe');
    await expect(page.getByRole('list', { name: 'Matches' })).toBeVisible();
    await search.press('Enter');
    const plan = page.getByRole('list', { name: 'Plan' });
    await expect(plan.getByText('Bronze Pickaxe', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/plan=i%3AITEM_Pickaxe_Bronze\*1|plan=i:ITEM_Pickaxe_Bronze\*1/);
    await page.getByLabel('How many Bronze Pickaxe').fill('2');
    const gather = page.locator('section', { has: page.getByRole('heading', { name: 'Gather' }) });
    await expect(gather.getByText('Copper Ore', { exact: true })).toBeVisible();
    await expect(gather.getByText('Tin Ore', { exact: true })).toBeVisible();
    const craft = page.locator('section', { has: page.getByRole('heading', { name: 'Craft' }) });
    await expect(craft.getByText('Bronze Bar', { exact: true })).toBeVisible();
    await expect(craft.getByText('Known by').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The base' })).toBeVisible();
    const experience = page.locator('section', {
      has: page.getByRole('heading', { name: 'Experience' })
    });
    await page.getByRole('combobox', { name: /^Plan for/ }).selectOption({ label: 'Juniper' });
    await expect(experience.getByText(/^(level \d+ → \d+|stays level \d+)$/).first()).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('How many Bronze Pickaxe')).toHaveValue('2', { timeout: 15_000 });
    await fits(page);
    expect(problems).toEqual([]);
  });
}

test('the map shows layers, finds places and marks the last saved positions', async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('/map?find=item:ITEM_Resources_CopperOre');
  await expect(page.getByRole('heading', { name: 'Copper Ore', exact: true })).toBeVisible();
  await expect(page.getByText(/places in the game build, ringed on the map/)).toBeVisible({
    timeout: 15_000
  });
  const pane = page.getByRole('button', { name: /^World map\./ });
  expect(await pane.locator('svg').getAttribute('viewBox')).not.toBe('0 0 900 900');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('checkbox', { name: /^Creatures/ }).check();
  await expect(page.getByRole('checkbox', { name: /^Creatures 3,/ })).toBeVisible({
    timeout: 15_000
  });
  await expect(page).toHaveURL(/layers=spawns/);
  await expect(pane.locator('title', { hasText: 'last saved position' })).toHaveCount(6);
  await expect(pane.locator('title', { hasText: /^Base/ })).toHaveCount(2);
  await page.getByLabel('Find on the map').fill('imaru');
  await page.getByRole('list', { name: 'Places that match' }).getByRole('button').first().click();
  await expect(page).toHaveURL(/find=name%3Aspawns%3AImaru/);
  await expect(page.getByRole('heading', { name: 'Imaru', exact: true })).toBeVisible();
  await page.goto('/map?area=Ghornfell');
  await expect(page.getByRole('heading', { name: 'Ghornfell', exact: true })).toBeVisible();
  await expect(page.getByText(/regions, outlined in gold/)).toBeVisible();
  expect(problems).toEqual([]);
});

test('a player page charts levels, plans a skill and lists the gear', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/players/4');
  await expect(page.locator('main h1')).toHaveText('Juniper');
  await expect(page.getByRole('img', { name: /^Total level from/ })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Experience this week' }).locator('li').first()
  ).toBeVisible();
  await expect(page.getByText(/xp to go$/)).toBeVisible();
  const skill = page.getByRole('combobox', { name: /^Skill/ });
  await expect(skill).toBeEnabled();
  const construction = await skill
    .locator('option', { hasText: /^Construction/ })
    .getAttribute('value');
  await skill.selectOption(construction!);
  await expect(page.getByText('Ways to earn it')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('list', { name: 'Equipped' }).locator('li')).toHaveCount(2);
  await expect(page.getByRole('list', { name: 'Carried' }).locator('li')).toHaveCount(6);
  expect(problems).toEqual([]);
});
