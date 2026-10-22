import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BASE_SPEED, COURSE_HALF_WIDTH, GOAL_Z, START_Z, TIME_LIMIT,
  createRace, getProgress, moveRattle, rankBabies, ringRattle,
  startRace, triggerAwakening, updateRace, useSuper,
  type Mode, type RaceState,
} from './simulation.ts';

function racing(mode: Mode = 'normal', seed = 123): RaceState {
  const state = createRace(mode, seed);
  startRace(state);
  updateRace(state, 3);
  assert.equal(state.phase, 'racing');
  return state;
}

function guide(state: RaceState, seconds: number, cadence = 1): void {
  const ticks = Math.round(seconds * 60);
  const interval = Math.round(cadence * 60);
  for (let i = 0; i < ticks && state.phase === 'racing'; i++) {
    const baby = state.babies[0];
    moveRattle(state, -1.65, baby.z - 3.1);
    if (i % interval === 0) ringRattle(state);
    updateRace(state, 1 / 60);
  }
}

test('countdown holds both babies and begins racing after three seconds', () => {
  const state = createRace();
  assert.equal(state.phase, 'ready');
  assert.equal(startRace(state), true);
  assert.equal(startRace(state), false);
  updateRace(state, 2);
  assert.equal(state.phase, 'countdown');
  assert.ok(Math.abs(state.countdown - 1) < 1e-8);
  assert.equal(state.babies[0].z, START_Z);
  updateRace(state, 1);
  assert.equal(state.phase, 'racing');
  assert.equal(state.time, 0);
});

test('moving a rattle never directly moves its baby and clamps the play area', () => {
  const state = racing('skill');
  moveRattle(state, 1000, -1000);
  assert.equal(state.babies[0].x, -1.65);
  assert.equal(state.babies[0].z, START_Z);
  assert.equal(state.rattles[0].x, COURSE_HALF_WIDTH + 0.5);
  assert.equal(state.rattles[0].z, GOAL_Z - 2.5);
  const previous = { ...state.rattles[0] };
  moveRattle(state, NaN, Infinity);
  assert.deepEqual(state.rattles[0], previous);
});

test('calls must be nearby and renewed; an unattended baby stops', () => {
  const idle = racing('skill');
  moveRattle(idle, -1.65, -15);
  ringRattle(idle);
  updateRace(idle, 6);
  assert.ok(getProgress(idle.babies[0]) < 0.02);
  assert.equal(idle.babies[0].state, 'look');

  const guided = racing('skill');
  guide(guided, 6);
  assert.ok(getProgress(guided.babies[0]) > 0.14);
  assert.ok(guided.babies[0].attention > 0.5);
});

test('a rattle behind a baby makes it turn smoothly and crawl backwards', () => {
  const state = racing('skill');
  state.babies[0].z = 4;
  moveRattle(state, -1.65, 7);
  ringRattle(state);
  updateRace(state, 0.1);
  assert.ok(Math.abs(state.babies[0].heading) < Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    ringRattle(state);
    updateRace(state, 0.7);
  }
  assert.ok(state.babies[0].z > 4.2);
  assert.ok(Math.cos(state.babies[0].heading) < -0.9);
});

test('frantic repeated rings create boredom; a steady cadence retains attention', () => {
  const spam = racing('skill');
  guide(spam, 2.5, 0.1);
  const steady = racing('skill');
  guide(steady, 2.5, 1);
  assert.ok(spam.babies[0].boredom > 0.6);
  assert.ok(steady.babies[0].boredom < 0.1);
  assert.ok(spam.babies[0].mood < steady.babies[0].mood);
  assert.ok(spam.events.some((event) => event.text.includes('飽きた')));
});

test('super is one use and recovers attention from an ordinary interruption', () => {
  const state = racing();
  const baby = state.babies[0];
  baby.state = 'distracted';
  baby.stateTime = 3;
  baby.attention = 0;
  baby.boredom = 1;
  assert.equal(useSuper(state), true);
  assert.equal(baby.state, 'groove');
  assert.equal(baby.attention, 1);
  assert.equal(baby.boredom, 0);
  assert.equal(useSuper(state), false);
  assert.equal(useSuper(state, 9), false);
});

test('awakening has a standing pose, a three-second run, and a cooldown', () => {
  const state = racing('normal');
  const baby = state.babies[0];
  moveRattle(state, baby.x, baby.z - 6);
  assert.equal(triggerAwakening(state), true);
  assert.equal(triggerAwakening(state), false);
  updateRace(state, 0.5);
  assert.equal(baby.awakeningPhase, 'pose');
  assert.equal(baby.z, START_Z);
  updateRace(state, 0.2);
  assert.equal(baby.awakeningPhase, 'run');
  const runStart = baby.z;
  updateRace(state, 2.8);
  assert.ok(runStart - baby.z > BASE_SPEED * 2.8 * 1.8);
  updateRace(state, 0.5);
  assert.notEqual(baby.state, 'awakening');
  assert.equal(baby.awakeningPhase, undefined);
  assert.equal(triggerAwakening(state), false);
  assert.equal(triggerAwakening(racing('skill')), false);
  assert.equal(triggerAwakening(createRace('normal')), false);
});

test('ordinary distractions can be shortened by close, spaced calls', () => {
  const state = racing('skill');
  const baby = state.babies[0];
  baby.state = 'distracted';
  baby.stateTime = 3;
  moveRattle(state, baby.x, baby.z - 2);
  ringRattle(state);
  assert.ok(baby.stateTime < 2);
  updateRace(state, 1);
  ringRattle(state);
  updateRace(state, 0.05);
  assert.notEqual(baby.state, 'distracted');
});

test('the same seed and inputs reproduce the same race at different render rates', () => {
  const fast = racing('chaos', 456);
  const slow = racing('chaos', 456);
  for (let second = 0; second < 20; second++) {
    for (const state of [fast, slow]) {
      const baby = state.babies[0];
      moveRattle(state, Math.sin(second) * 2, baby.z - 3);
      ringRattle(state);
    }
    for (let frame = 0; frame < 60; frame++) updateRace(fast, 1 / 60);
    for (let frame = 0; frame < 30; frame++) updateRace(slow, 1 / 30);
  }
  assert.deepEqual(fast, slow);
});

test('first crossing records a finish time and resolves the race immediately', () => {
  const state = racing('skill');
  const baby = state.babies[0];
  baby.z = GOAL_Z + 0.01;
  moveRattle(state, baby.x, GOAL_Z - 2);
  ringRattle(state);
  updateRace(state, 0.1);
  assert.equal(state.phase, 'finished');
  assert.equal(state.winner, 0);
  assert.equal(state.finishReason, 'goal');
  assert.equal(baby.z, GOAL_Z);
  assert.ok(baby.finishedAt !== null && baby.finishedAt > 0 && baby.finishedAt < 0.1);
});

test('timeout ranks by course progress and clamps elapsed time to sixty seconds', () => {
  const state = racing('skill');
  state.time = TIME_LIMIT - 0.01;
  state.babies[0].z = 1;
  state.babies[1].z = 4;
  updateRace(state, 0.1);
  assert.equal(state.phase, 'finished');
  assert.equal(state.finishReason, 'timeout');
  assert.equal(state.time, TIME_LIMIT);
  assert.equal(state.winner, 0);
  assert.equal(rankBabies(state)[0].id, 0);
  assert.equal(getProgress({ z: GOAL_Z - 5 }), 1);
  assert.equal(getProgress({ z: START_Z + 5 }), 0);
});

test('CPU handles its rattle, reaches the finish, and remains in bounds', () => {
  const state = racing('normal', 99);
  updateRace(state, 60);
  assert.equal(state.phase, 'finished');
  assert.equal(state.winner, 1);
  assert.equal(state.finishReason, 'goal');
  assert.ok(state.time > 30 && state.time < TIME_LIMIT);
  for (const baby of state.babies) {
    assert.ok(Math.abs(baby.x) <= COURSE_HALF_WIDTH);
    assert.ok(Number.isFinite(baby.heading));
    assert.ok(baby.attention >= 0 && baby.attention <= 1);
  }
});

test('invalid frame durations cannot corrupt the simulation', () => {
  const state = racing();
  const before = JSON.stringify(state);
  for (const duration of [-1, 0, NaN, Infinity]) updateRace(state, duration);
  assert.equal(JSON.stringify(state), before);
  assert.equal(ringRattle(state, 99), false);
});
