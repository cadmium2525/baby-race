import { test, expect, type Page } from '@playwright/test';

type Snapshot = {
  phase: string; paused: boolean; time: number; winner: number | null;
  babies: {id: number; x: number; z: number; state: string; superUsed: boolean}[];
  rattles: {x: number; z: number; pulse: number}[];
  events: {text: string; kind: string}[];
};
const snapshot = (page: Page) => page.evaluate(() => (window as unknown as {__babyRace: Snapshot}).__babyRace);
const openGame = async (page: Page) => {
  // Decorative fonts must not make local gameplay tests depend on Google uptime.
  await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
};

test('a complete race supports guidance, super, pause, awakening, result and replay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openGame(page);
  await expect(page.locator('#start-button')).toBeVisible();
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#webgl-error')).toBeHidden();
  await page.screenshot({ path: 'test-results/title-desktop.png' });
  await page.locator('[data-mode="chaos"]').click();
  await page.locator('#help-button').click();
  await expect(page.locator('#help')).toBeVisible();
  await page.locator('#help-close').click();
  await page.locator('#start-button').click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('racing');
  const before = await snapshot(page);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(350);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('Space');
  expect((await snapshot(page)).rattles[0].z).toBeLessThan(before.rattles[0].z - .5);
  const pointerBefore = (await snapshot(page)).rattles[0].x;
  await page.mouse.move(960, 370);
  await page.mouse.click(960, 370);
  expect(Math.abs((await snapshot(page)).rattles[0].x - pointerBefore)).toBeGreaterThan(.2);
  await page.locator('#super-button').click();
  expect((await snapshot(page)).babies[0].superUsed).toBe(true);
  await expect(page.locator('#super-button')).toBeDisabled();
  await page.keyboard.press('Escape');
  const paused = await snapshot(page);
  expect(paused.paused).toBe(true);
  await page.waitForTimeout(300);
  expect((await snapshot(page)).time).toBe(paused.time);
  await page.locator('#resume-button').click();
  await page.screenshot({ path: 'test-results/racing-desktop.png' });
  // Observe the actual CPU, event scheduler and renderer without changing game state.
  await expect.poll(async () => (await snapshot(page)).babies.some(b => b.state === 'awakening'), {timeout: 25_000, intervals: [200]}).toBe(true);
  await page.screenshot({ path: 'test-results/awakening-desktop.png' });
  await expect(page.locator('#result')).toBeVisible({timeout: 65_000});
  const finished = await snapshot(page);
  expect(finished.winner).not.toBeNull();
  await expect(page.locator('.result-row')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/result-desktop.png' });
  await page.locator('#retry-button').click();
  expect((await snapshot(page)).phase).toBe('countdown');
  expect((await snapshot(page)).babies[0].superUsed).toBe(false);
  expect(errors).toEqual([]);
});

test('portrait mobile keeps controls on screen and accepts touch guidance', async ({ browser }) => {
  const context = await browser.newContext({ viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await openGame(page);
  await expect(page.locator('#start-button')).toBeInViewport();
  await page.screenshot({ path: 'test-results/title-mobile.png' });
  await page.locator('#start-button').tap();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('racing');
  await expect(page.locator('#mobile-ring')).toBeInViewport();
  await expect(page.locator('#super-button')).toBeInViewport();
  await page.touchscreen.tap(175, 390);
  await page.locator('#mobile-ring').tap();
  const labels = await Promise.all([page.locator('#label-0').boundingBox(), page.locator('#label-1').boundingBox()]);
  const [a, b] = labels;
  if (a && b) expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
  await page.screenshot({ path: 'test-results/racing-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
