import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraStepAlpha, dampRaceCamera, fitRaceCamera, type RaceCameraFrame } from './camera.ts';

const frame = (): RaceCameraFrame => ({ x: 0, y: 0, z: 0, height: 15.5 });
const group = (leaderZ: number) => [-3.9, -1.3, 1.3, 3.9].map((x, i) => ({ x, z: leaderZ + i }));

test('goal framing stays continuous through the former Z=-10 camera cut', () => {
  for (const aspect of [1440 / 900, 390 / 844]) {
    const before = fitRaceCamera(group(-9.9999), aspect, frame());
    const after = fitRaceCamera(group(-10.0001), aspect, frame());
    assert.ok(Math.abs(after.z - before.z) < .001);
    assert.ok(Math.abs(after.height - before.height) < .001);
  }
});

test('a complete approach to the goal has no one-frame framing discontinuity', () => {
  for (const aspect of [1440 / 900, 390 / 844]) {
    const previous = frame(); fitRaceCamera(group(0), aspect, previous);
    const next = frame();
    for (let step = 1; step <= 1200; step++) {
      fitRaceCamera(group(-step / 60), aspect, next);
      assert.ok(Math.abs(next.z - previous.z) < .04);
      assert.ok(Math.abs(next.height - previous.height) / previous.height < .002);
      Object.assign(previous, next);
    }
  }
});

test('camera follow and zoom agree at 30, 60 and 120 FPS', () => {
  const desired = { x: 4, y: 1, z: -15, height: 46 };
  const results = [30, 60, 120].map(fps => {
    const current = frame();
    for (let i = 0; i < fps; i++) dampRaceCamera(current, desired, 1 / fps);
    return current;
  });
  for (const actual of results.slice(1)) for (const key of ['x', 'y', 'z', 'height'] as const) assert.ok(Math.abs(actual[key] - results[0][key]) < 1e-10);
});

test('paused and invalid dt freeze the camera, and long frames are bounded', () => {
  const current = frame(), desired = { x: 20, y: 5, z: -30, height: 60 };
  for (const dt of [0, -1, NaN, Infinity]) { dampRaceCamera(current, desired, dt); assert.deepEqual(current, frame()); }
  assert.equal(cameraStepAlpha(30), cameraStepAlpha(.1));
  dampRaceCamera(current, desired, 30);
  assert.ok(current.height > 15.5 && current.height < 30);
});

test('reduced motion still follows continuously and respects pauses', () => {
  const current = frame(), desired = { x: 20, y: 0, z: -20, height: 40 };
  dampRaceCamera(current, desired, 1 / 60, true);
  assert.ok(current.x > 0 && current.x < 3);
  assert.ok(current.height > 15.5 && current.height < 18);
  const paused = { ...current }; dampRaceCamera(current, desired, 0, true); assert.deepEqual(current, paused);
});
