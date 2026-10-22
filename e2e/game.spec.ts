import { test, expect, type Page } from '@playwright/test';

type Snapshot = {
  phase: string; paused: boolean; time: number; winner: number | null;
  humanPlayers: number; courseId: string; discovered: string[];
  babies: { id: number; name: string; isCpu: boolean; x: number; z: number; state: string;
    eventId: string | null; zone: string | null; superUsed: boolean;
    style: { name: string; color: string; accessory: string } }[];
  rattles: { x: number; z: number; pulse: number }[];
  events: { text: string; kind: string; eventId: string | null }[];
};
const snapshot = (page: Page) => page.evaluate(() => (window as unknown as { __babyRace: Snapshot }).__babyRace);
const openGame = async (page: Page) => {
  // Decorative fonts must not make gameplay tests depend on Google's network.
  await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#start-button')).toBeVisible();
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#webgl-error')).toBeHidden();
};
const start = async (page: Page) => {
  await page.locator('#start-button').click();
  await expect.poll(async () => (await snapshot(page)).phase, { timeout: 15_000 }).toBe('racing');
};
const prepareFourPlayers = async (page: Page) => {
  await page.locator('#setup-button').click();
  await page.locator('#human-players').selectOption('4');
  await page.locator('#setup-close').click();
};
const positions = (state: Snapshot) => state.rattles.map(({ x, z }) => ({ x, z }));
const labelsDoNotOverlap = async (page: Page) => {
  const boxes = await Promise.all([0, 1, 2, 3].map(id => page.locator(`#label-${id}`).boundingBox()));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (!a || !b || !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y)) return false;
  }
  return true;
};

test('a pending decorative font stylesheet does not block game boot', async ({ page }) => {
  let release = () => {};
  let fontPending = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://fonts.googleapis.com/**', async route => {
    fontPending = true;
    await gate;
    await route.abort();
  });
  try {
    await page.goto('/', { waitUntil: 'commit' });
    await expect.poll(() => fontPending).toBe(true);
    await expect(page.locator('#start-button')).toBeVisible();
    await expect(page.locator('#game-canvas')).toBeVisible();
    await expect(page.locator('#webgl-error')).toBeHidden();
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('solo race supports four babies, chaos, pause, discoveries, result and replay', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Keep event scheduling repeatable while exercising the real race and renderer.
  await page.addInitScript(() => { Date.now = () => 20261022; });
  await openGame(page);
  const initial = await snapshot(page);
  expect(initial.babies).toHaveLength(4);
  expect(initial.humanPlayers).toBe(1);
  expect(initial.babies.filter(baby => baby.isCpu)).toHaveLength(3);
  await page.screenshot({ path: 'test-results/title-desktop.png' });
  await page.locator('#catalog-button').click();
  await expect(page.locator('.event-entry')).toHaveCount(24);
  await expect(page.locator('.event-entry.undiscovered')).toHaveCount(24);
  await page.locator('#catalog-close').click();
  await page.locator('[data-mode="chaos"]').click();
  await page.locator('#help-button').click();
  await expect(page.locator('#help')).toBeVisible();
  await page.locator('#help-close').click();
  await start(page);
  const before = await snapshot(page);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('Space');
  expect((await snapshot(page)).rattles[0].z).toBeLessThan(before.rattles[0].z - .5);
  const pointerBefore = (await snapshot(page)).rattles[0].x;
  await page.mouse.click(960, 370);
  expect(Math.abs((await snapshot(page)).rattles[0].x - pointerBefore)).toBeGreaterThan(.2);
  await page.locator('#super-button').click();
  expect((await snapshot(page)).babies[0].superUsed).toBe(true);
  await expect(page.locator('#super-button')).toBeDisabled();
  await page.keyboard.press('Escape');
  const paused = await snapshot(page);
  expect(paused.paused).toBe(true);
  await page.waitForTimeout(250);
  expect((await snapshot(page)).time).toBe(paused.time);
  await page.locator('#resume-button').click();
  await page.screenshot({ path: 'test-results/racing-desktop.png' });
  await expect.poll(async () => (await snapshot(page)).babies.some(baby => baby.eventId?.startsWith('S')), { timeout: 25_000, intervals: [150] }).toBe(true);
  await page.screenshot({ path: 'test-results/legendary-desktop.png' });
  await expect(page.locator('#result')).toBeVisible({ timeout: 150_000 });
  const finished = await snapshot(page);
  expect(finished.winner).not.toBeNull();
  expect(finished.discovered.length).toBeGreaterThan(0);
  await expect(page.locator('.result-row')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/result-desktop.png' });
  await page.locator('#retry-button').click();
  const replay = await snapshot(page);
  expect(replay.phase).toBe('countdown');
  expect(replay.time).toBe(0);
  expect(replay.winner).toBeNull();
  expect(replay.babies.every(baby => !baby.superUsed)).toBe(true);
  await page.keyboard.press('Escape');
  await page.locator('#return-button').click();
  await page.locator('#catalog-button').click();
  await expect(page.locator('.event-entry.discovered')).toHaveCount(finished.discovered.length);
  await page.screenshot({ path: 'test-results/catalog-desktop.png' });
  await page.locator('#catalog-close').click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#start-button')).toBeVisible();
  expect((await snapshot(page)).discovered).toEqual(finished.discovered);
  expect(errors).toEqual([]);
});

test('course and customization persist, and four keyboards control independent rattles', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openGame(page);
  await page.locator('#setup-button').click();
  await page.locator('#human-players').selectOption('4');
  await page.locator('[data-course="toybox"]').click();
  await page.locator('[data-custom-player="1"]').click();
  await page.locator('#baby-name').fill('テストベビー');
  await page.locator('#baby-name').press('Tab');
  await page.locator('#baby-color').evaluate(input => {
    (input as HTMLInputElement).value = '#4a90e2';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('#baby-accessory').selectOption('bunny');
  await page.screenshot({ path: 'test-results/setup-desktop.png' });
  await page.locator('#setup-close').click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#start-button')).toBeVisible();
  const saved = await snapshot(page);
  expect(saved.humanPlayers).toBe(4);
  expect(saved.courseId).toBe('toybox');
  expect(saved.babies.every(baby => !baby.isCpu)).toBe(true);
  expect(saved.babies[1].style).toEqual({ name: 'テストベビー', color: '#4a90e2', accessory: 'bunny' });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('baby-race-settings-v2')!).humanPlayers)).toBe(4);
  await start(page);
  const mappings = [
    { id: 1, move: 'ArrowUp', ring: 'Enter', super: 'ShiftRight' },
    { id: 2, move: 'i', ring: 'o', super: 'u' },
    { id: 3, move: 'Numpad8', ring: 'Numpad0', super: 'NumpadDecimal' },
    { id: 0, move: 'w', ring: 'Space', super: 'r' },
  ];
  for (const mapping of mappings) {
    const before = await snapshot(page);
    await page.keyboard.down(mapping.move);
    await page.waitForTimeout(250);
    await page.keyboard.up(mapping.move);
    await page.keyboard.press(mapping.ring);
    const after = await snapshot(page);
    expect(after.rattles[mapping.id].z).toBeLessThan(before.rattles[mapping.id].z - .5);
    expect(after.rattles[mapping.id].pulse).toBeGreaterThan(0);
    for (let id = 0; id < 4; id++) if (id !== mapping.id) expect(positions(after)[id]).toEqual(positions(before)[id]);
    await page.keyboard.press(mapping.super);
    const boosted = await snapshot(page);
    expect(boosted.babies[mapping.id].superUsed).toBe(true);
    if (mapping.id !== 0) expect(boosted.babies[0].superUsed).toBe(false);
  }
  await page.locator('#control-player').selectOption('2');
  const beforePointer = await snapshot(page);
  await page.mouse.click(980, 400);
  const afterPointer = await snapshot(page);
  expect(positions(afterPointer)[2]).not.toEqual(positions(beforePointer)[2]);
  for (const id of [0, 1, 3]) expect(positions(afterPointer)[id]).toEqual(positions(beforePointer)[id]);
  await page.screenshot({ path: 'test-results/multiplayer-desktop.png' });
  expect(errors).toEqual([]);
});

test('mock gamepads map the second controller independently to player two', async ({ page }) => {
  type MockPad = { connected: boolean; axes: number[]; buttons: { pressed: boolean }[] };
  await page.addInitScript(() => {
    const scope = window as unknown as { __testPads: unknown[] };
    scope.__testPads = [];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => scope.__testPads });
  });
  await openGame(page);
  await prepareFourPlayers(page);
  await start(page);
  const before = await snapshot(page);
  await page.evaluate(() => {
    (window as unknown as { __testPads: MockPad[] }).__testPads = [
      { connected: true, axes: [0, 0], buttons: Array.from({ length: 6 }, () => ({ pressed: false })) },
      { connected: true, axes: [.7, 0], buttons: Array.from({ length: 6 }, (_, id) => ({ pressed: id === 0 || id === 5 })) },
    ];
  });
  await expect.poll(async () => (await snapshot(page)).rattles[1].x).toBeGreaterThan(before.rattles[1].x + .4);
  const after = await snapshot(page);
  expect(after.babies[1].superUsed).toBe(true);
  expect(after.babies[0].superUsed).toBe(false);
  expect(positions(after)[0]).toEqual(positions(before)[0]);
  await page.evaluate(() => { (window as unknown as { __testPads: unknown[] }).__testPads = []; });
  await page.screenshot({ path: 'test-results/gamepad-mapping-desktop.png' });
});

for (const height of [844, 690]) test(`portrait 390x${height} supports setup scrolling, touch and four readable labels`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await openGame(page);
    await page.locator('#start-button').scrollIntoViewIfNeeded();
    await expect(page.locator('#start-button')).toBeInViewport();
    await page.screenshot({ path: `test-results/title-mobile-${height}.png` });
    await page.locator('#setup-button').tap();
    await expect(page.locator('#human-players')).toBeInViewport();
    await page.locator('[data-course="cloud"]').tap();
    await page.locator('[data-custom-player="3"]').tap();
    await page.locator('#baby-accessory').selectOption('crown');
    await page.locator('.keyboard-guide summary').tap();
    await page.locator('#setup-close').scrollIntoViewIfNeeded();
    await expect(page.locator('#setup-close')).toBeInViewport();
    await page.screenshot({ path: `test-results/setup-mobile-${height}.png` });
    await page.locator('#setup-close').tap();
    await page.locator('#start-button').tap();
    await expect.poll(async () => (await snapshot(page)).phase, { timeout: 15_000 }).toBe('racing');
    await expect(page.locator('#mobile-ring')).toBeInViewport();
    await expect(page.locator('#super-button')).toBeInViewport();
    await expect(page.locator('#control-player')).toBeInViewport();
    expect((await snapshot(page)).courseId).toBe('cloud');
    const before = (await snapshot(page)).rattles[0];
    await page.touchscreen.tap(175, 330);
    await page.locator('#mobile-ring').tap();
    const after = (await snapshot(page)).rattles[0];
    expect({ x: after.x, z: after.z }).not.toEqual({ x: before.x, z: before.z });
    expect(after.pulse).toBeGreaterThan(0);
    await expect.poll(() => labelsDoNotOverlap(page)).toBe(true);
    await page.screenshot({ path: `test-results/racing-mobile-${height}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
