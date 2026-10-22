import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BASE_SPEED, COURSE_HALF_WIDTH, GOAL_Z, START_Z, TIME_LIMIT,
  createRace, getProgress, moveRattle, rankBabies, ringRattle,
  startRace, triggerAwakening, triggerEvent, updateRace, useSuper,
  type Mode, type RaceOptions, type RaceState,
} from './simulation.ts';
import { COURSES, DEFAULT_STYLES, EVENTS, type EventId } from './content.ts';

function racing(mode: Mode = 'normal', seed = 123, options: RaceOptions = {}): RaceState {
  const state = createRace(mode, seed, options);
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
    moveRattle(state, baby.x, baby.z - 3.1);
    if (i % interval === 0) ringRattle(state);
    updateRace(state, 1 / 60);
  }
}

test('countdown holds all four babies and begins racing after three seconds', () => {
  const state = createRace();
  assert.equal(state.phase, 'ready');
  assert.equal(startRace(state), true);
  assert.equal(startRace(state), false);
  updateRace(state, 2);
  assert.equal(state.phase, 'countdown');
  assert.ok(Math.abs(state.countdown - 1) < 1e-8);
  assert.ok(state.babies.every(baby => baby.z === START_Z));
  updateRace(state, 1);
  assert.equal(state.phase, 'racing');
  assert.equal(state.time, 0);
});

test('moving a rattle never directly moves its baby and clamps the play area', () => {
  const state = racing('skill');
  moveRattle(state, 1000, -1000);
  assert.equal(state.babies[0].x, -3.9);
  assert.equal(state.babies[0].z, START_Z);
  assert.equal(state.rattles[0].x, COURSE_HALF_WIDTH + 0.5);
  assert.equal(state.rattles[0].z, GOAL_Z - 2.5);
  const previous = { ...state.rattles[0] };
  moveRattle(state, NaN, Infinity);
  assert.deepEqual(state.rattles[0], previous);
});

test('calls must be nearby and renewed; an unattended baby stops', () => {
  const idle = racing('skill');
  moveRattle(idle, idle.babies[0].x, -15);
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
  moveRattle(state, state.babies[0].x, 7);
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

test('all three CPUs guide independently, reach the finish, and remain in bounds', () => {
  const state = racing('normal', 99);
  const initialTargets = state.rattles.map(rattle => ({ ...rattle }));
  updateRace(state, 6);
  assert.equal(state.babies.length, 4);
  assert.equal(state.babies.filter(baby => baby.isCpu).length, 3);
  for (const baby of state.babies.slice(1)) {
    assert.ok(getProgress(baby) > 0.1);
    assert.notEqual(state.rattles[baby.id].z, initialTargets[baby.id].z);
    assert.ok(baby.attention > 0.4);
  }
  assert.deepEqual(state.rattles[0], initialTargets[0]);
  updateRace(state, 60);
  assert.equal(state.phase, 'finished');
  assert.ok([1, 2, 3].includes(state.winner!));
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

test('local player counts are clamped, styles are copied, and a replay starts clean', () => {
  assert.equal(createRace('normal', 1, { humanPlayers: 0 }).humanPlayers, 1);
  assert.equal(createRace('normal', 1, { humanPlayers: 10 }).humanPlayers, 4);
  assert.equal(createRace('normal', 1, { humanPlayers: NaN }).humanPlayers, 1);
  const styles = DEFAULT_STYLES.map(style => ({ ...style }));
  styles[2] = { name: '  ひよこ  ', color: '#abcdef', accessory: 'bunny' };
  const first = racing('chaos', 45, { humanPlayers: 3, courseId: 'cloud', styles });
  assert.deepEqual(first.babies.map(baby => baby.isCpu), [false, false, false, true]);
  assert.equal(first.babies[2].name, 'ひよこ');
  assert.equal(first.babies[2].style.accessory, 'bunny');
  styles[2].name = '変更';
  assert.equal(first.babies[2].name, 'ひよこ');
  useSuper(first, 2);
  triggerEvent(first, 'S06', 0);
  const next = createRace('normal', 45, { humanPlayers: 4, courseId: 'toybox' });
  assert.equal(next.courseId, 'toybox');
  assert.equal(next.phase, 'ready');
  assert.equal(next.time, 0);
  assert.equal(next.winner, null);
  assert.deepEqual(next.events, []);
  for (const baby of next.babies) {
    assert.equal(baby.superUsed, false);
    assert.equal(baby.eventId, null);
    assert.equal(baby.zone, null);
    assert.equal(baby.finishedAt, null);
    assert.equal(baby.z, START_Z);
  }
});

test('four local humans retain independent rattles without any CPU assistance', () => {
  const state = racing('skill', 9, { humanPlayers: 4 });
  const initial = state.rattles.map(rattle => ({ ...rattle }));
  moveRattle(state, 2.2, 7, 2);
  assert.equal(ringRattle(state, 2), true);
  assert.equal(useSuper(state, 3), true);
  assert.equal(state.babies[0].superUsed, false);
  updateRace(state, 6);
  assert.equal(state.babies.filter(baby => baby.isCpu).length, 0);
  assert.deepEqual(state.rattles[0], initial[0]);
  assert.deepEqual(state.rattles[1], initial[1]);
  assert.equal(state.rattles[2].x, 2.2);
  assert.equal(state.rattles[2].z, 7);
  assert.equal(state.rattles[3].x, initial[3].x);
  assert.equal(state.rattles[3].z, initial[3].z);
  assert.equal(state.rattles[2].pulse, 0);
  assert.equal(state.babies[2].state, 'look');
  const before = JSON.stringify(state.rattles);
  moveRattle(state, 1, 1, 99);
  assert.equal(JSON.stringify(state.rattles), before);
});

for (const definition of EVENTS) {
  test(`${definition.id} ${definition.name} activates an actual effect and expires`, () => {
    const state = racing('normal', 3, { humanPlayers: 4 });
    const baby = state.babies[0];
    moveRattle(state, baby.x, baby.z - 6);
    assert.equal(triggerEvent(state, definition.id), true);
    assert.equal(baby.eventId, definition.id);
    assert.ok(baby.stateTime > 0 && baby.stateTime <= 4);
    assert.equal(state.events[0].eventId, definition.id);
    assert.equal(triggerEvent(state, definition.id), false);
    updateRace(state, 5);
    assert.equal(baby.eventId, null);
    assert.equal(baby.awakeningPhase, undefined);
    assert.notEqual(baby.state, 'awakening');
    assert.ok(Number.isFinite(baby.x) && Number.isFinite(baby.z) && Number.isFinite(baby.heading));
  });
}

test('event guards enforce phase, negative-event spacing, special cooldown, and skill rules', () => {
  const ready = createRace();
  assert.equal(triggerEvent(ready, 'R01'), false);
  startRace(ready);
  assert.equal(triggerEvent(ready, 'N03'), false);
  const ordinary = racing('normal', 8, { humanPlayers: 4 });
  assert.equal(triggerEvent(ordinary, 'N03'), true);
  updateRace(ordinary, 2);
  assert.equal(ordinary.babies[0].eventId, null);
  assert.equal(triggerEvent(ordinary, 'N01'), false);
  updateRace(ordinary, 5.1);
  assert.equal(triggerEvent(ordinary, 'N01'), true);
  const special = racing('normal', 8, { humanPlayers: 4 });
  assert.equal(triggerEvent(special, 'S06'), true);
  updateRace(special, 6);
  assert.equal(triggerEvent(special, 'S02'), false);
  // Advancing the public race clock isolates the cooldown from future scheduling.
  special.time = 18;
  assert.equal(triggerEvent(special, 'S02'), true);
  for (const definition of EVENTS.filter(event => event.rarity === 'legendary')) {
    assert.equal(triggerEvent(racing('skill'), definition.id), false);
  }
  assert.equal(triggerEvent(racing('skill'), 'R04'), true);
  const finished = racing();
  finished.phase = 'finished';
  assert.equal(triggerEvent(finished, 'N08'), false);
  assert.equal(triggerEvent(racing(), 'N08', 99), false);
});

test('laughter spreads to nearby babies and traffic makes two babies follow each other', () => {
  const laugh = racing('normal', 3, { humanPlayers: 4 });
  laugh.babies[0].x = 0;
  laugh.babies[1].x = 2;
  laugh.babies[2].x = -2;
  laugh.babies[3].z = 3;
  assert.equal(triggerEvent(laugh, 'R05'), true);
  assert.deepEqual(laugh.babies.map(baby => baby.eventId), ['R05', 'R05', 'R05', null]);
  assert.equal(laugh.babies[1].state, 'rest');
  updateRace(laugh, 1);
  assert.ok(laugh.babies.every(baby => baby.eventId === null));
  const traffic = racing('normal', 3, { humanPlayers: 4 });
  const firstX = traffic.babies[0].x, nextX = traffic.babies[1].x;
  assert.equal(triggerEvent(traffic, 'R03'), true);
  updateRace(traffic, 0.5);
  assert.equal(traffic.babies[0].eventId, 'R03');
  assert.equal(traffic.babies[1].eventId, 'R03');
  assert.ok(traffic.babies[0].x > firstX);
  assert.ok(traffic.babies[1].x < nextX);
});

test('boosts, robot steering, ninja zigzags, reverse running and drifting have distinct motion', () => {
  const sample = (eventId: EventId | null, targetX = 0, seconds = 1) => {
    const state = racing('normal', 3, { humanPlayers: 4 });
    state.babies[0].x = 0; state.babies[0].z = 12;
    moveRattle(state, targetX, 6);
    ringRattle(state);
    if (eventId) assert.equal(triggerEvent(state, eventId), true);
    updateRace(state, seconds);
    return state.babies[0];
  };
  const base = sample(null);
  const jet = sample('R01'), crawl = sample('R02'), excited = sample('R04');
  assert.ok(jet.z < base.z - 0.4);
  assert.ok(crawl.z > jet.z && crawl.z < base.z - 0.3);
  assert.ok(excited.z < jet.z - 0.05);
  assert.ok(sample('S02', 5).heading < sample('S06', 5).heading - 0.2);
  assert.ok(Math.abs(sample('S04', 0, 0.3).x) > 0.04);
  assert.ok(sample('S05').z > 12.8);
  assert.ok(sample('S03').z > base.z + 0.2);
  assert.ok(sample('S07', 3).x > sample('S06', 3).x + 0.1);
  assert.ok(sample('R06').heading > Math.PI * 2);
});

test('the finish area shortens forced stops and a super recovers an ordinary event', () => {
  const state = racing('normal', 3, { humanPlayers: 4 });
  const baby = state.babies[0];
  baby.z = GOAL_Z + 2;
  assert.equal(triggerEvent(state, 'N03'), true);
  assert.ok(baby.stateTime <= 0.65);
  assert.equal(useSuper(state), true);
  assert.equal(baby.eventId, null);
  assert.equal(baby.state, 'groove');
  const grin = racing('normal', 3, { humanPlayers: 4 });
  grin.babies[0].z = GOAL_Z + 1;
  assert.equal(triggerEvent(grin, 'S08'), true);
  assert.ok(grin.babies[0].stateTime <= 0.65);
});

function zoneSample(courseId: RaceOptions['courseId'], x: number, z: number, targetX = x, distance = 3, seconds = 0.5): RaceState {
  const state = racing('skill', 3, { humanPlayers: 4, courseId });
  state.babies[0].x = x; state.babies[0].z = z;
  moveRattle(state, targetX, z - distance);
  ringRattle(state);
  updateRace(state, seconds);
  return state;
}

test('all five zone kinds affect motion or hearing and course selection changes their layout', () => {
  assert.equal(COURSES.length, 3);
  assert.notDeepEqual(COURSES[0].zones, COURSES[1].zones);
  const toy = zoneSample('nursery', -4, 6), noToy = zoneSample('toybox', -4, 6);
  assert.equal(toy.babies[0].zone, 'toy');
  assert.equal(noToy.babies[0].zone, null);
  assert.ok(toy.babies[0].x > noToy.babies[0].x + 0.005);
  const cushion = zoneSample('nursery', 3, -5), noCushion = zoneSample('toybox', 3, -5);
  assert.equal(cushion.babies[0].zone, 'cushion');
  assert.ok(cushion.babies[0].z > noCushion.babies[0].z + 0.1);
  const ball = zoneSample('nursery', 0, 1), noBall = zoneSample('nursery', 0, 3);
  assert.equal(ball.babies[0].zone, 'ball');
  assert.ok(Math.abs(ball.babies[0].x - noBall.babies[0].x) > 0.03);
  const echo = zoneSample('nursery', 0, -10, 0, 11, 0.1), noEcho = zoneSample('nursery', 0, -8, 0, 11, 0.1);
  assert.equal(echo.babies[0].zone, 'echo');
  assert.ok(echo.babies[0].attention > noEcho.babies[0].attention + 0.3);
  assert.ok(echo.babies[0].z < -10);
  assert.equal(noEcho.babies[0].z, -8);
  const sprint = zoneSample('nursery', 0, -17), noSprint = zoneSample('nursery', 0, -14);
  assert.equal(sprint.babies[0].zone, 'sprint');
  assert.ok(-17 - sprint.babies[0].z > -14 - noSprint.babies[0].z + 0.05);
  assert.equal(zoneSample('cloud', 3, 8).babies[0].zone, 'echo');
});

test('zone notifications occur on entry, not every frame', () => {
  const state = zoneSample('nursery', 0, 1, 0, 3, 0.1);
  const entries = () => state.events.filter(event => event.babyId === 0 && event.kind === 'zone').length;
  assert.equal(entries(), 1);
  updateRace(state, 0.3);
  assert.equal(entries(), 1);
  state.babies[0].z = 3; updateRace(state, 1 / 60);
  assert.equal(state.babies[0].zone, null);
  state.babies[0].z = 1; updateRace(state, 1 / 60);
  assert.equal(entries(), 2);
});

test('every catalog event can be reached through seeded natural race schedules', () => {
  const encountered = new Set<EventId>();
  for (let seed = 0; seed < 96; seed++) {
    const state = racing('chaos', seed);
    const seen = new Set<number>();
    while (state.phase === 'racing') {
      const baby = state.babies[0];
      moveRattle(state, baby.x, baby.z - 3);
      if (Math.floor(state.time * 4) % 4 === 0) ringRattle(state);
      updateRace(state, 0.25);
      for (const event of state.events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        if (event.eventId) encountered.add(event.eventId);
      }
    }
  }
  assert.deepEqual([...encountered].sort(), EVENTS.map(event => event.id).sort());
});

test('normal races cap rare schedules at two and legendary schedules at one; skill never schedules legendary', () => {
  let racesWithLegendary = 0;
  for (let seed = 0; seed < 32; seed++) {
    const state = racing('normal', seed);
    const rareOccurrences = new Set<string>(), legendaryOccurrences = new Set<string>();
    while (state.phase === 'racing') {
      updateRace(state, 0.25);
      for (const event of state.events) {
        if (event.eventId?.startsWith('R')) rareOccurrences.add(`${event.eventId}:${event.time}`);
        if (event.eventId?.startsWith('S')) legendaryOccurrences.add(`${event.eventId}:${event.time}`);
      }
    }
    assert.ok(rareOccurrences.size >= 1 && rareOccurrences.size <= 2);
    assert.ok(legendaryOccurrences.size <= 1);
    if (legendaryOccurrences.size) racesWithLegendary++;
  }
  assert.ok(racesWithLegendary > 0 && racesWithLegendary < 16);
  const skill = racing('skill', 4);
  while (skill.phase === 'racing') {
    updateRace(skill, 0.5);
    assert.ok(skill.events.every(event => !event.eventId?.startsWith('S')));
  }
});
