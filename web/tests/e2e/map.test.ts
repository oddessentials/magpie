import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 1080 },
  { width: 390, height: 844 }
]) {
  test(`map navigation, saved markers and layers at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/map');
    await expect(page.getByRole('heading', { name: 'World map', exact: true })).toBeVisible();
    const pane = page.getByRole('button', { name: /^World map\./ });
    const svg = pane.locator('svg');
    await expect(pane).toBeEnabled();
    await expect(svg).toHaveAttribute('viewBox', '0 0 900 900');
    await expect(pane.locator('title', { hasText: 'discovered in the save' })).toHaveCount(1);
    await expect(page.getByText('2 saved characters', { exact: true })).toBeVisible();
    await page.getByLabel('Find a region').selectOption('15');
    await expect(
      page.getByRole('heading', { name: 'Forgotten Temple', exact: true })
    ).toBeVisible();
    const focused = await svg.getAttribute('viewBox');
    expect(focused).not.toBe('0 0 900 900');
    await pane.focus();
    await page.keyboard.press('ArrowRight');
    expect(await svg.getAttribute('viewBox')).not.toBe(focused);
    await page.keyboard.press('Home');
    await expect(svg).toHaveAttribute('viewBox', '0 0 900 900');
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const beforeDrag = await svg.getAttribute('viewBox');
    const box = (await pane.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 4 });
    await page.mouse.up();
    expect(await svg.getAttribute('viewBox')).not.toBe(beforeDrag);
    await page.getByRole('checkbox', { name: 'Fixed lodestones', exact: true }).uncheck();
    await expect(pane.locator('title', { hasText: 'Lodestone' })).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Fixed lodestones', exact: true }).check();
    await expect(pane.locator('title', { hasText: 'Lodestone' })).toHaveCount(4);
    await page.getByLabel('Find a region').selectOption('31');
    await expect(page.getByRole('combobox', { name: 'Map view', exact: true })).toHaveValue(
      'outer'
    );
    await expect(
      page.getByRole('heading', { name: 'Scorned Wilderness', exact: true })
    ).toBeVisible();
    await page.getByRole('combobox', { name: 'Map view', exact: true }).selectOption('all');
    await expect(svg).toHaveAttribute('viewBox', '0 0 900 900');
    await page.getByText('Boss locations', { exact: true }).click();
    await page.getByRole('button', { name: 'Show Fuzan location 2', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Fuzan', exact: true })).toBeVisible();
    expect(await svg.getAttribute('viewBox')).not.toBe('0 0 900 900');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false
    );
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    expect(
      body.split(
        "Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex."
      )
    ).toHaveLength(2);
    expect(errors).toEqual([]);
  });
}

test('phone pinch zoom keeps the map interactive after a cancelled gesture', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/map');
  const pane = page.getByRole('button', { name: /^World map\./ });
  await expect(pane).toBeEnabled();
  await pane.scrollIntoViewIfNeeded();
  const box = (await pane.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const touches = (delta: number) => [
    { x: box.x + box.width / 2 - delta, y: box.y + box.height / 2, id: 1 },
    { x: box.x + box.width / 2 + delta, y: box.y + box.height / 2, id: 2 }
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(30) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches(65) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  expect(await pane.locator('svg').getAttribute('viewBox')).not.toBe('0 0 900 900');
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(pane.locator('svg')).toHaveAttribute('viewBox', '0 0 900 900');
});
