import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { EVENTS } from '../src/content';

type Snapshot = {
  phase: string; paused: boolean; time: number; winner: number | null;
  humanPlayers: number; courseId: string; discovered: string[];
  babies: { id: number; name: string; isCpu: boolean; x: number; z: number; state: string;
    eventId: string | null; zone: string | null; superUsed: boolean; stateTime: number;
    style: { name: string; color: string; accessory: string } }[];
  rattles: { x: number; z: number; pulse: number }[];
  events: { text: string; kind: string; eventId: string | null }[];
  cinematic: null | { babyId: number; eventId: string; elapsed: number; duration: number; amount: number; phase: 'enter' | 'hold' | 'exit' };
  camera: { viewHeight: number; x: number; y: number; z: number };
};
type CameraSample = { time: number; paused: boolean; cinematic: boolean; eventId: string | null; camera: Snapshot['camera'] };
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
const frozenValues = (state: Snapshot) => ({ time: state.time,
  babies: state.babies.map(({ x, z, stateTime, superUsed }) => ({ x, z, stateTime, superUsed })),
  rattles: state.rattles.map(rattle => ({ ...rattle })),
});
const observeCamera = async (page: Page) => page.addInitScript(() => {
  const scope = window as unknown as { __babyRace?: Snapshot; __testCameraFrames: CameraSample[] };
  scope.__testCameraFrames = [];
  const record = () => {
    const state = scope.__babyRace;
    if (state?.camera && state.phase === 'racing') scope.__testCameraFrames.push({
      time: state.time, paused: state.paused, cinematic: state.cinematic !== null, eventId: state.cinematic?.eventId ?? null, camera: { ...state.camera },
    });
    if (scope.__testCameraFrames.length > 6000) scope.__testCameraFrames.shift();
    requestAnimationFrame(record);
  };
  requestAnimationFrame(record);
});
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

test('normal race shows early frozen closeups, resumes smoothly, finishes and replays', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Keep event scheduling repeatable while exercising the real race and renderer.
  await page.addInitScript(() => { Date.now = () => 20261022; });
  await observeCamera(page);
  await openGame(page);
  const initial = await snapshot(page);
  expect(initial.babies).toHaveLength(4);
  expect(initial.humanPlayers).toBe(1);
  expect(initial.babies.filter(baby => baby.isCpu)).toHaveLength(3);
  await page.screenshot({ path: 'test-results/title-desktop.png' });
  await page.locator('#catalog-button').click();
  await expect(page.locator('.event-entry')).toHaveCount(EVENTS.length);
  await expect(page.locator('.event-entry.undiscovered')).toHaveCount(EVENTS.length);
  await page.locator('#catalog-close').click();
  await page.locator('[data-mode="normal"]').click();
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
  await page.keyboard.press('Escape');
  const paused = await snapshot(page);
  expect(paused.paused).toBe(true);
  await page.waitForTimeout(250);
  expect((await snapshot(page)).time).toBe(paused.time);
  await page.locator('#resume-button').click();
  await page.screenshot({ path: 'test-results/racing-desktop.png' });
  await expect.poll(async () => (await snapshot(page)).cinematic?.eventId.startsWith('R'), { timeout: 40_000, intervals: [100] }).toBe(true);
  const shot = await snapshot(page);
  expect(shot.time).toBeLessThanOrEqual(14);
  expect(shot.paused).toBe(false);
  expect(shot.babies.every(baby => Number.isFinite(baby.stateTime))).toBe(true);
  await expect.poll(async () => (await snapshot(page)).cinematic?.elapsed ?? -1).toBeGreaterThan(shot.cinematic!.elapsed);
  expect(frozenValues(await snapshot(page))).toEqual(frozenValues(shot));
  await page.keyboard.press('Escape');
  const pausedShot = await snapshot(page);
  expect(pausedShot.paused).toBe(true);
  await page.waitForTimeout(250);
  expect((await snapshot(page)).cinematic).toEqual(pausedShot.cinematic);
  expect(frozenValues(await snapshot(page))).toEqual(frozenValues(pausedShot));
  await page.locator('#resume-button').click();
  const blocked = await snapshot(page);
  await page.keyboard.down('w');
  await page.keyboard.press('Space');
  await page.keyboard.press('r');
  await page.mouse.click(980, 400);
  await page.waitForTimeout(120);
  await page.keyboard.up('w');
  expect(frozenValues(await snapshot(page))).toEqual(frozenValues(blocked));
  await expect.poll(async () => (await snapshot(page)).cinematic?.phase, { intervals: [100] }).toBe('hold');
  await expect(page.locator('#cinematic')).toBeVisible();
  await expect(page.locator('#cinematic-title')).not.toHaveText('');
  await expect(page.locator('#cinematic-player')).not.toHaveText('');
  await page.screenshot({ path: 'test-results/cinematic-rare-desktop.png' });
  await page.locator('#cinematic-skip').click();
  const exiting = await snapshot(page);
  expect(exiting.cinematic?.phase).toBe('exit');
  expect(exiting.cinematic!.amount).toBeGreaterThan(0);
  expect(frozenValues(exiting)).toEqual(frozenValues(shot));
  await expect.poll(async () => (await snapshot(page)).cinematic, { timeout: 10_000 }).toBeNull();
  await expect.poll(async () => {
    const state = await snapshot(page);
    return state.cinematic === null && state.time > shot.time;
  }).toBe(true);
  await page.locator('#super-button').click();
  expect((await snapshot(page)).babies[0].superUsed).toBe(true);
  await expect(page.locator('#super-button')).toBeDisabled();
  let capturedNormalLegendary = false;
  await expect.poll(async () => {
    const state = await snapshot(page);
    if (!capturedNormalLegendary && state.cinematic?.eventId.startsWith('S') && state.cinematic.phase === 'hold') {
      await page.screenshot({ path: 'test-results/normal-legendary-desktop.png' });
      capturedNormalLegendary = true;
    }
    return state.phase;
  }, { timeout: 180_000, intervals: [150] }).toBe('finished');
  await expect(page.locator('#result')).toBeVisible();
  expect(capturedNormalLegendary).toBe(true);
  const finished = await snapshot(page);
  expect(finished.winner).not.toBeNull();
  expect(finished.discovered.length).toBeGreaterThan(0);
  await expect(page.locator('.result-row')).toHaveCount(4);
  const cameraFrames = await page.evaluate(() => (window as unknown as { __testCameraFrames: CameraSample[] }).__testCameraFrames);
  const cameraSteps = cameraFrames.slice(1).flatMap((frame, index) => {
    const previous = cameraFrames[index];
    if (frame.time < 25 || frame.time > 35 || frame.cinematic || previous.cinematic || frame.paused || previous.paused || frame.time <= previous.time) return [];
    return [{ time: frame.time, before: previous.camera.viewHeight, after: frame.camera.viewHeight,
      relative: Math.abs(frame.camera.viewHeight - previous.camera.viewHeight) / previous.camera.viewHeight }];
  });
  const seenShots = new Set<string>();
  const eventOccurrences = cameraFrames.flatMap(frame => {
    if (!frame.eventId) return [];
    const key = `${frame.eventId}:${frame.time}`;
    if (seenShots.has(key)) return [];
    seenShots.add(key);
    return [{ time: frame.time, eventId: frame.eventId }];
  });
  await writeFile('test-results/camera-continuity.json', JSON.stringify({ cameraSteps, cameraFrames, eventOccurrences }, null, 2));
  expect(cameraSteps.length).toBeGreaterThan(10);
  expect(Math.max(...cameraSteps.map(step => step.relative))).toBeLessThan(.06);
  await page.screenshot({ path: 'test-results/result-desktop.png' });
  await page.locator('#retry-button').click();
  const replay = await snapshot(page);
  expect(replay.phase).toBe('countdown');
  expect(replay.time).toBe(0);
  expect(replay.winner).toBeNull();
  expect(replay.cinematic).toBeNull();
  expect(replay.babies.every(baby => !baby.superUsed)).toBe(true);
  await page.keyboard.press('Escape');
  await page.locator('#return-button').click();
  expect((await snapshot(page)).cinematic).toBeNull();
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

test('portrait legendary closeup zooms in while the race and controls stay frozen', async ({ browser }) => {
  test.setTimeout(100_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 690 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.addInitScript(() => { Date.now = () => 20261022; });
    await openGame(page);
    await page.locator('[data-mode="chaos"]').click();
    await start(page);
    const racingCamera = (await snapshot(page)).camera.viewHeight;
    await expect.poll(async () => {
      const state = await snapshot(page);
      if (state.cinematic?.eventId.startsWith('R') && state.cinematic.phase !== 'exit') await page.locator('#cinematic-skip').click();
      return state.cinematic?.eventId.startsWith('S') ?? false;
    }, { timeout: 70_000, intervals: [150] }).toBe(true);
    await expect.poll(async () => (await snapshot(page)).cinematic?.phase, { intervals: [100] }).toBe('hold');
    const closeup = await snapshot(page);
    expect(closeup.camera.viewHeight).toBeLessThan(racingCamera * .85);
    await page.waitForTimeout(200);
    expect(frozenValues(await snapshot(page))).toEqual(frozenValues(closeup));
    const labelsHidden = await page.locator('#baby-labels').evaluate(element => {
      const style = getComputedStyle(element);
      return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
    });
    expect(labelsHidden).toBe(true);
    await expect(page.locator('#cinematic')).toBeVisible();
    await expect(page.locator('#cinematic-skip')).toBeInViewport();
    await page.screenshot({ path: 'test-results/cinematic-legendary-mobile.png' });
    await page.locator('#cinematic-skip').tap();
    expect((await snapshot(page)).cinematic?.phase).toBe('exit');
    await expect.poll(async () => (await snapshot(page)).cinematic, { timeout: 10_000 }).toBeNull();
    await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(closeup.time);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
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
