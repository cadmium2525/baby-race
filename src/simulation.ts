/** Deterministic race rules. Forward is -Z; heading 0 faces the finish. */
export type Mode = 'normal' | 'chaos' | 'skill';
export type Phase = 'ready' | 'countdown' | 'racing' | 'finished';
export type BabyState = 'happy' | 'look' | 'distracted' | 'groove' | 'rest' | 'awakening';
export type AwakeningPhase = 'pose' | 'run' | 'landing';

export interface Baby {
  id: number;
  name: string;
  x: number;
  z: number;
  heading: number;
  state: BabyState;
  /** Remaining seconds in a timed state; zero means an untimed state. */
  stateTime: number;
  mood: number;
  attention: number;
  boredom: number;
  superUsed: boolean;
  finishedAt: number | null;
  event: string;
  awakeningPhase?: AwakeningPhase;
}

export interface Rattle { x: number; z: number; /** Seconds left in the visible pulse. */ pulse: number }
export interface RaceEvent { id: number; babyId: number; text: string; kind: string; time: number }
export interface RaceState {
  phase: Phase;
  mode: Mode;
  /** Elapsed racing time, excluding the countdown. */
  time: number;
  countdown: number;
  babies: Baby[];
  rattles: Rattle[];
  /** Newest notification first. */
  events: RaceEvent[];
  winner: number | null;
  finishReason?: 'goal' | 'timeout';
}

export const COURSE_LENGTH = 34;
export const COURSE_HALF_WIDTH = 5.5;
export const START_Z = 14;
export const GOAL_Z = START_Z - COURSE_LENGTH;
export const TIME_LIMIT = 60;
export const BASE_SPEED = 0.85;
export const STATE_LABELS: Record<BabyState, string> = {
  happy: 'ごきげん', look: 'キョロキョロ', distracted: '寄り道',
  groove: 'ノリノリ', rest: 'ひとやすみ', awakening: 'たっち覚醒！',
};
export const DUCK_SPOTS = [
  { x: -4.2, z: 6 }, { x: 4.2, z: -3 }, { x: -3.9, z: -11.5 },
] as const;

const STEP = 1 / 60;
const HEARING_RANGE = 8.5;
const AWAKE_POSE = 0.65;
const AWAKE_RUN = 3;
const AWAKE_LANDING = 0.3;
const AWAKE_DURATION = AWAKE_POSE + AWAKE_RUN + AWAKE_LANDING;

interface Runtime {
  rng: number;
  accumulator: number;
  clock: number;
  eventId: number;
  lastRing: number[];
  lastAcceptedRing: number[];
  lastNegative: number[];
  nextNormal: number[];
  normalCount: number[];
  nextGroove: number[];
  nextBored: number[];
  distraction: { x: number; z: number }[];
  superUntil: number[];
  awakeReady: number[];
  cpuRing: number;
  cpuSuper: number;
  nextRare: number;
  nextAwake: number;
}

// Keeping scheduling data outside the render state prevents the renderer from
// accidentally coupling animations to random-number draws or AI timers.
const runtimes = new WeakMap<RaceState, Runtime>();
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function random(rt: Runtime): number {
  // Mulberry32: seeded, reproducible, and independent of Math.random().
  rt.rng = (rt.rng + 0x6D2B79F5) >>> 0;
  let value = rt.rng;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function runtime(state: RaceState): Runtime {
  const rt = runtimes.get(state);
  if (!rt) throw new Error('Use createRace() to create an active simulation.');
  return rt;
}

/** Supply a seed for varied replays while retaining deterministic tests. */
export function createRace(mode: Mode = 'normal', seed = 20261022): RaceState {
  const babies: Baby[] = ['もちもち', 'ぷくぷく'].map((name, id) => ({
    id, name, x: id === 0 ? -1.65 : 1.65, z: START_Z, heading: 0,
    state: 'happy', stateTime: 0, mood: 0.85, attention: 0.68, boredom: 0,
    superUsed: false, finishedAt: null, event: '',
  }));
  const state: RaceState = {
    phase: 'ready', mode, time: 0, countdown: 3, babies,
    rattles: babies.map((baby) => ({ x: baby.x, z: START_Z - 2.9, pulse: 0 })),
    events: [], winner: null,
  };
  const rt: Runtime = {
    rng: Number.isFinite(seed) ? seed >>> 0 : 20261022,
    accumulator: 0, clock: 0, eventId: 0,
    lastRing: [-0.5, -0.5], lastAcceptedRing: [-10, -10],
    lastNegative: [-10, -10], nextNormal: [8, 10], normalCount: [0, 0],
    nextGroove: [3, 4], nextBored: [0, 0],
    distraction: babies.map((baby) => ({ x: baby.x, z: baby.z })),
    superUntil: [-1, -1], awakeReady: [0, 0], cpuRing: 0.2, cpuSuper: 29,
    nextRare: mode === 'skill' ? Infinity : 17,
    nextAwake: Infinity,
  };
  // Normal awakening is deliberately uncommon. The demonstration button can
  // call triggerAwakening without altering the rarity of ordinary races.
  if (mode === 'chaos') rt.nextAwake = 12 + random(rt) * 4;
  else if (mode === 'normal' && random(rt) < 0.28) rt.nextAwake = 24 + random(rt) * 10;
  rt.cpuSuper += random(rt) * 7;
  runtimes.set(state, rt);
  return state;
}

export function startRace(state: RaceState): boolean {
  if (state.phase !== 'ready') return false;
  state.phase = 'countdown';
  state.countdown = 3;
  return true;
}

/** Move only the human's rattle. Babies never teleport with the pointer. */
export function moveRattle(state: RaceState, x: number, z: number): void {
  if (state.phase === 'finished' || !Number.isFinite(x) || !Number.isFinite(z)) return;
  state.rattles[0].x = clamp(x, -COURSE_HALF_WIDTH - 0.5, COURSE_HALF_WIDTH + 0.5);
  state.rattles[0].z = clamp(z, GOAL_Z - 2.5, START_Z + 1.5);
}

function notify(state: RaceState, baby: Baby, text: string, kind = 'normal'): void {
  const rt = runtime(state);
  baby.event = text;
  state.events.unshift({ id: ++rt.eventId, babyId: baby.id, text, kind, time: state.time });
  state.events.length = Math.min(state.events.length, 6);
}

function setState(baby: Baby, value: BabyState, seconds = 0): void {
  baby.state = value;
  baby.stateTime = seconds;
  if (value !== 'awakening') delete baby.awakeningPhase;
}

export function ringRattle(state: RaceState, id = 0): boolean {
  if (state.phase !== 'racing' && state.phase !== 'countdown') return false;
  const baby = state.babies[id];
  const rattle = state.rattles[id];
  if (!baby || !rattle || baby.finishedAt !== null) return false;
  const rt = runtime(state);
  const interval = rt.clock - rt.lastAcceptedRing[id];
  if (interval < 0.075) return false;
  rt.lastAcceptedRing[id] = rt.clock;
  rattle.pulse = 0.48;
  const distance = Math.hypot(rattle.x - baby.x, rattle.z - baby.z);
  if (distance > HEARING_RANGE && rt.superUntil[id] < state.time) return true;

  rt.lastRing[id] = rt.clock;
  const spam = interval < 0.38;
  baby.boredom = clamp(baby.boredom + (spam ? 0.19 : 0.015), 0, 1);
  baby.attention = clamp(baby.attention + 0.48 * (1 - baby.boredom * 0.7), 0, 1);
  baby.mood = clamp(baby.mood + (spam ? -0.045 : 0.035), 0.2, 1);

  if (state.phase === 'countdown') return true;
  if (baby.boredom > 0.77 && state.time >= rt.nextBored[id] && baby.state !== 'awakening') {
    setState(baby, 'look', 1.35);
    baby.attention = 0.18;
    rt.nextBored[id] = state.time + 8;
    rt.lastNegative[id] = state.time;
    notify(state, baby, 'ガラガラ飽きた…', 'warning');
    return true;
  }

  // Close, well-timed calls can interrupt ordinary distractions. Repeated
  // frantic taps remain less useful because boredom reduces attention.
  if (distance < 5 && !spam) {
    if (baby.state === 'distracted') {
      baby.stateTime = Math.max(0, baby.stateTime - 1.1);
      if (baby.stateTime === 0) setState(baby, 'happy');
    } else if (baby.state === 'rest') {
      baby.stateTime = baby.stateTime <= 0.95 ? 0 : baby.stateTime - 0.18;
      if (baby.stateTime === 0) setState(baby, 'happy');
    }
    else if (baby.state === 'look' && baby.stateTime <= 0.8) setState(baby, 'happy');
  }
  if (baby.state === 'happy' && interval >= 0.65 && interval <= 1.6 &&
      baby.attention > 0.75 && baby.boredom < 0.3 && state.time >= rt.nextGroove[id]) {
    setState(baby, 'groove', 1.7);
    rt.nextGroove[id] = state.time + 9;
    notify(state, baby, 'ノリノリ♪', 'good');
  }
  return true;
}

export function useSuper(state: RaceState, id = 0): boolean {
  const baby = state.babies[id];
  if (state.phase !== 'racing' || !baby || baby.superUsed || baby.finishedAt !== null) return false;
  const rt = runtime(state);
  baby.superUsed = true;
  baby.attention = 1;
  baby.boredom = 0;
  baby.mood = 1;
  rt.lastRing[id] = rt.clock;
  rt.superUntil[id] = state.time + 3.4;
  state.rattles[id].pulse = 1.3;
  if (baby.state !== 'awakening') setState(baby, 'groove', 3.4);
  notify(state, baby, 'スーパーガラガラ！', 'super');
  return true;
}

/** A manual showcase respects the same mode and consecutive-event guards. */
export function triggerAwakening(state: RaceState, id = 0): boolean {
  const baby = state.babies[id];
  if (state.phase !== 'racing' || state.mode === 'skill' || !baby ||
      baby.finishedAt !== null || baby.state === 'awakening') return false;
  const rt = runtime(state);
  if (state.time < rt.awakeReady[id]) return false;
  setState(baby, 'awakening', AWAKE_DURATION);
  baby.awakeningPhase = 'pose';
  baby.attention = Math.max(0.6, baby.attention);
  rt.lastRing[id] = rt.clock;
  rt.awakeReady[id] = state.time + AWAKE_DURATION + 14;
  notify(state, baby, '突然立ったーー！！', 'legendary');
  return true;
}

export function getProgress(baby: Pick<Baby, 'z'>): number {
  return clamp((START_Z - baby.z) / COURSE_LENGTH, 0, 1);
}

export function rankBabies(state: Pick<RaceState, 'babies'>): Baby[] {
  return [...state.babies].sort((a, b) => {
    if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt || a.id - b.id;
    if (a.finishedAt !== null) return -1;
    if (b.finishedAt !== null) return 1;
    return getProgress(b) - getProgress(a) || a.id - b.id;
  });
}

function turnTowards(heading: number, desired: number, maxTurn: number): number {
  const difference = Math.atan2(Math.sin(desired - heading), Math.cos(desired - heading));
  return heading + clamp(difference, -maxTurn, maxTurn);
}

function ordinaryEvent(state: RaceState, baby: Baby): void {
  const rt = runtime(state);
  const id = baby.id;
  const closeToGoal = baby.z < GOAL_Z + 4;
  const duck = rt.normalCount[id] % 2 === 0 && !closeToGoal;
  rt.normalCount[id] += 1;
  rt.lastNegative[id] = state.time;
  if (duck) {
    const spot = [...DUCK_SPOTS].sort((a, b) => Math.abs(a.z - baby.z) - Math.abs(b.z - baby.z))[0];
    rt.distraction[id] = { x: spot.x, z: clamp(spot.z, baby.z - 1.5, baby.z + 1.5) };
    setState(baby, 'distracted', 2.7 + random(rt) * 0.6);
    notify(state, baby, 'アヒルさん発見！', 'warning');
  } else {
    setState(baby, 'rest', closeToGoal ? 0.65 : 1.5 + random(rt) * 0.4);
    notify(state, baby, 'おしりペタン', 'warning');
  }
}

function updateCpu(state: RaceState, dt: number): void {
  const rt = runtime(state);
  const baby = state.babies[1];
  if (baby.finishedAt !== null) return;
  const target = state.rattles[1];
  const lane = 1.65 + Math.sin(state.time * 0.3) * 0.7;
  target.x += (lane - target.x) * Math.min(1, dt * 3);
  target.z = Math.max(GOAL_Z - 2, baby.z - 3.25);
  if (state.time >= rt.cpuRing) {
    ringRattle(state, 1);
    rt.cpuRing = state.time + 0.95 + random(rt) * 0.36;
  }
  if (state.time >= rt.cpuSuper && !baby.superUsed) useSuper(state, 1);
}

function updateSchedules(state: RaceState): void {
  const rt = runtime(state);
  for (const baby of state.babies) {
    if (baby.finishedAt !== null || state.time < rt.nextNormal[baby.id]) continue;
    if (baby.state === 'awakening' || baby.state === 'rest' || baby.state === 'distracted' ||
        state.time - rt.lastNegative[baby.id] < 7) {
      rt.nextNormal[baby.id] = state.time + 1;
      continue;
    }
    ordinaryEvent(state, baby);
    rt.nextNormal[baby.id] = state.time + (state.mode === 'chaos' ? 8 : 12) + random(rt) * 5;
  }
  if (state.time >= rt.nextRare) {
    const choices = state.babies.filter((baby) => baby.finishedAt === null && baby.state === 'happy');
    if (choices.length) {
      const baby = choices[Math.floor(random(rt) * choices.length)];
      setState(baby, 'groove', 2.2);
      notify(state, baby, 'おしりジェット！', 'rare');
      rt.nextRare = state.time + (state.mode === 'chaos' ? 10 : 22);
    } else rt.nextRare = state.time + 0.5;
  }
  if (state.time >= rt.nextAwake) {
    const choices = state.babies.filter((baby) => baby.finishedAt === null && baby.state !== 'awakening');
    const baby = choices[Math.floor(random(rt) * choices.length)];
    if (baby && triggerAwakening(state, baby.id)) {
      rt.nextAwake = state.mode === 'chaos' ? state.time + 21 : Infinity;
    } else rt.nextAwake = state.time + 1;
  }
}

function updateBaby(state: RaceState, baby: Baby, dt: number): void {
  if (baby.finishedAt !== null) return;
  const rt = runtime(state);
  const id = baby.id;
  baby.boredom = Math.max(0, baby.boredom - dt * 0.105);
  baby.attention = Math.max(0, baby.attention - dt * (baby.boredom > 0.6 ? 0.27 : 0.16));
  baby.mood = Math.max(0.3, baby.mood - dt * 0.002);

  if (baby.stateTime > 0) {
    baby.stateTime = Math.max(0, baby.stateTime - dt);
    if (baby.stateTime === 0) setState(baby, baby.attention < 0.13 ? 'look' : 'happy');
  }
  if (baby.state === 'awakening') {
    baby.awakeningPhase = baby.stateTime > AWAKE_RUN + AWAKE_LANDING ? 'pose' :
      baby.stateTime > AWAKE_LANDING ? 'run' : 'landing';
  }
  if (baby.state === 'rest' || (baby.state === 'awakening' && baby.awakeningPhase !== 'run')) return;
  if (baby.state === 'look') return;

  const rattle = state.rattles[id];
  const isAwake = baby.state === 'awakening';
  const isSuper = state.time <= rt.superUntil[id];
  const distracted = baby.state === 'distracted';
  const target = distracted ? rt.distraction[id] : rattle;
  const dx = target.x - baby.x;
  const dz = target.z - baby.z;
  const distance = Math.hypot(dx, dz);
  const recentCall = rt.clock - rt.lastRing[id] < (isSuper ? 4 : 3.1);
  if (!distracted && !isAwake && !isSuper &&
      (!recentCall || baby.attention < 0.12 || distance > HEARING_RANGE)) {
    if (baby.attention < 0.14 || !recentCall) setState(baby, 'look');
    return;
  }
  const desired = Math.atan2(dx, -dz);
  baby.heading = turnTowards(baby.heading, desired, dt * (isAwake ? 0.9 : 4.3));
  const leadingProgress = Math.max(...state.babies.map(getProgress));
  const catchUp = 1 + clamp((leadingProgress - getProgress(baby)) * 0.18, 0, 0.045);
  let speed = BASE_SPEED * (0.94 + baby.mood * 0.09) * catchUp;
  if (isAwake) speed *= 2;
  else if (isSuper) speed *= 1.42;
  else if (baby.state === 'groove') speed *= baby.event === 'おしりジェット！' ? 1.75 : 1.24;
  if (distracted) speed *= 0.63;
  if (!isAwake) speed *= clamp((distance - 0.42) / 1.05, 0, 1);
  const previousZ = baby.z;
  baby.x = clamp(baby.x + Math.sin(baby.heading) * speed * dt, -COURSE_HALF_WIDTH, COURSE_HALF_WIDTH);
  baby.z = clamp(baby.z - Math.cos(baby.heading) * speed * dt, GOAL_Z - 0.1, START_Z + 0.6);
  if (baby.z <= GOAL_Z) {
    const fraction = previousZ === baby.z ? 1 : clamp((previousZ - GOAL_Z) / (previousZ - baby.z), 0, 1);
    baby.finishedAt = state.time - dt + fraction * dt;
    baby.z = GOAL_Z;
  }
}

function tick(state: RaceState, dt: number): void {
  const rt = runtime(state);
  rt.clock += dt;
  for (const rattle of state.rattles) rattle.pulse = Math.max(0, rattle.pulse - dt);
  if (state.phase === 'countdown') {
    state.countdown = Math.max(0, state.countdown - dt);
    if (state.countdown < 1e-8) {
      state.countdown = 0;
      state.phase = 'racing';
      rt.lastRing = [rt.clock, rt.clock];
      notify(state, state.babies[0], 'よーい、ハイハイ！', 'start');
    }
    return;
  }
  if (state.phase !== 'racing') return;
  const raceStep = Math.min(dt, TIME_LIMIT - state.time);
  state.time += raceStep;
  updateCpu(state, raceStep);
  updateSchedules(state);
  for (const baby of state.babies) updateBaby(state, baby, raceStep);
  const ranking = rankBabies(state);
  if (ranking[0].finishedAt !== null) {
    state.phase = 'finished';
    state.winner = ranking[0].id;
    state.finishReason = 'goal';
    notify(state, ranking[0], 'ゴーーール！', 'finish');
  } else if (state.time >= TIME_LIMIT - 1e-8) {
    state.time = TIME_LIMIT;
    state.phase = 'finished';
    state.winner = ranking[0].id;
    state.finishReason = 'timeout';
    notify(state, ranking[0], 'タイムアップ！', 'finish');
  }
}

/** Fixed 60Hz simulation keeps AI and event schedules independent of FPS. */
export function updateRace(state: RaceState, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0 || state.phase === 'ready') return;
  const rt = runtime(state);
  // A suspended browser must not create an unbounded catch-up loop.
  rt.accumulator += Math.min(dt, 120);
  while (rt.accumulator >= STEP - 1e-10) {
    tick(state, STEP);
    rt.accumulator = Math.max(0, rt.accumulator - STEP);
    if (state.phase === 'finished') {
      rt.accumulator = 0;
      break;
    }
  }
}
