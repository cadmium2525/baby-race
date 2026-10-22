import { ACCESSORIES, DEFAULT_STYLES, EVENTS, ZONE_LABELS, getCourse, getEvent, type BabyStyle, type CourseId, type CourseZone, type EventId, type ZoneKind } from './content.ts';

/** Deterministic race rules. Forward is -Z; heading 0 faces the finish. */
export type Mode = 'normal' | 'chaos' | 'skill';
export type Phase = 'ready' | 'countdown' | 'racing' | 'finished';
export type BabyState = 'happy' | 'look' | 'distracted' | 'groove' | 'rest' | 'awakening';
export type AwakeningPhase = 'pose' | 'run' | 'landing';
export interface Baby {
  id: number; name: string; isCpu: boolean; style: BabyStyle;
  x: number; z: number; heading: number; state: BabyState;
  /** Remaining effect seconds; zero means an untimed state. */
  stateTime: number;
  mood: number; attention: number; boredom: number; superUsed: boolean;
  finishedAt: number | null; event: string;
  /** Active effect only; cleared on expiry or a super interruption. */
  eventId: EventId | null;
  zone: ZoneKind | null;
  awakeningPhase?: AwakeningPhase;
}
export interface Rattle { x: number; z: number; pulse: number }
export interface RaceEvent { id: number; babyId: number; text: string; kind: string; time: number; eventId?: EventId }
export interface RaceState {
  phase: Phase; mode: Mode; humanPlayers: number; courseId: CourseId;
  time: number; countdown: number; babies: Baby[]; rattles: Rattle[];
  events: RaceEvent[]; winner: number | null; finishReason?: 'goal' | 'timeout';
}
export interface RaceOptions { humanPlayers?: number; courseId?: CourseId; styles?: BabyStyle[] }
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
/** Compatibility export; the chosen course owns its actual duck locations. */
export const DUCK_SPOTS = getCourse('nursery').duckSpots;
const STEP = 1 / 60, HEARING_RANGE = 8.5;
const AWAKE_RUN = 3, AWAKE_LANDING = 0.3, AWAKE_DURATION = 0.65 + AWAKE_RUN + AWAKE_LANDING;
const LANES = [-3.9, -1.3, 1.3, 3.9];
const NORMAL_EVENTS = EVENTS.filter(e => e.rarity === 'normal').map(e => e.id);
const RARE_EVENTS = EVENTS.filter(e => e.rarity === 'rare').map(e => e.id);
const LEGENDARY_EVENTS = EVENTS.filter(e => e.rarity === 'legendary').map(e => e.id);
const NEGATIVE = new Set<EventId>(['N01','N02','N03','N04','N05','N06','N07','N08','R03','R05','R06','R07','R09','R10','S05','S08','S09']);
interface Runtime {
  rng: number; accumulator: number; clock: number; notificationId: number;
  lastRing: number[]; lastAcceptedRing: number[]; lastNegative: number[];
  eventReady: number[]; specialReady: number[]; nextNormal: number[]; normalCursor: number[];
  nextGroove: number[]; nextBored: number[];
  distraction: { x: number; z: number }[]; targetBaby: (number | null)[]; effectElapsed: number[];
  superUntil: number[]; cpuRing: number[]; cpuSuper: number[]; zoneIndex: number[];
  rareCursor: number; rareCount: number; nextRare: number; legendaryCursor: number; nextLegendary: number;
  pendingFinishPose: boolean; rareWaiting: boolean; legendaryWaiting: boolean;
}
// Rendering cannot consume random draws or advance AI clocks.
const runtimes = new WeakMap<RaceState, Runtime>();
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
function random(rt: Runtime): number {
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
/** One to four local humans; remaining lanes have independent CPUs. */
export function createRace(mode: Mode = 'normal', seed = 20261022, options: RaceOptions = {}): RaceState {
  const humanPlayers = Number.isFinite(options.humanPlayers) ? clamp(Math.floor(options.humanPlayers!), 1, 4) : 1;
  const course = getCourse(options.courseId ?? 'nursery');
  const babies: Baby[] = DEFAULT_STYLES.map((fallback, id) => {
    const selected = options.styles?.[id];
    const style: BabyStyle = {
      name: selected?.name?.trim().slice(0, 12) || fallback.name,
      color: selected?.color && /^#[0-9a-f]{6}$/i.test(selected.color) ? selected.color : fallback.color,
      accessory: selected && ACCESSORIES.includes(selected.accessory) ? selected.accessory : fallback.accessory,
    };
    return { id, name: style.name, style, isCpu: id >= humanPlayers, x: LANES[id], z: START_Z,
      heading: 0, state: 'happy', stateTime: 0, mood: 0.85, attention: 0.68, boredom: 0,
      superUsed: false, finishedAt: null, event: '', eventId: null, zone: null };
  });
  const state: RaceState = {
    phase: 'ready', mode, humanPlayers, courseId: course.id, time: 0, countdown: 3, babies,
    rattles: babies.map(b => ({ x: b.x, z: START_Z - 2.9, pulse: 0 })), events: [], winner: null,
  };
  const all = (n: number) => babies.map(() => n);
  const rt: Runtime = {
    rng: Number.isFinite(seed) ? seed >>> 0 : 20261022, accumulator: 0, clock: 0, notificationId: 0,
    lastRing: all(-0.5), lastAcceptedRing: all(-10), lastNegative: all(-20), eventReady: all(0), specialReady: all(0),
    nextNormal: babies.map((_, id) => 8 + id * 1.1), normalCursor: all(0),
    nextGroove: babies.map((_, id) => 3 + id), nextBored: all(0),
    distraction: babies.map(b => ({ x: b.x, z: b.z })), targetBaby: babies.map(() => null), effectElapsed: all(0),
    superUntil: all(-1), cpuRing: babies.map((_, id) => 0.2 + id * 0.12), cpuSuper: all(0), zoneIndex: all(-1),
    rareCursor: 0, rareCount: 0, nextRare: 16, legendaryCursor: 0, nextLegendary: Infinity,
    pendingFinishPose: false, rareWaiting: false, legendaryWaiting: false,
  };
  rt.normalCursor = babies.map(() => Math.floor(random(rt) * NORMAL_EVENTS.length));
  rt.cpuSuper = babies.map((_, id) => 25 + id + random(rt) * 7);
  rt.rareCursor = Math.floor(random(rt) * RARE_EVENTS.length);
  rt.legendaryCursor = Math.floor(random(rt) * LEGENDARY_EVENTS.length);
  // Normal retains the former chaos cadence as the event catalog grows.
  // Chaos requests more events; the shared per-baby guards still decide whether
  // a participant can safely receive them.
  if (mode !== 'skill') rt.nextNormal = babies.map(() => (mode === 'chaos' ? 2 : 3) + random(rt) * 2);
  rt.nextRare = mode === 'chaos' ? 4 + random(rt) * 2 : mode === 'normal' ? 6 + random(rt) * 2 : 16 + random(rt) * 3;
  if (mode !== 'skill') rt.nextLegendary = mode === 'chaos' ? 6 + random(rt) * 2 : 8 + random(rt) * 3;
  runtimes.set(state, rt);
  return state;
}
export function startRace(state: RaceState): boolean {
  if (state.phase !== 'ready') return false;
  state.phase = 'countdown'; state.countdown = 3; return true;
}
/** Moving a selected rattle never directly moves its baby. */
export function moveRattle(state: RaceState, x: number, z: number, id = 0): void {
  const rattle = state.rattles[id];
  if (!rattle || state.phase === 'finished' || !Number.isFinite(x) || !Number.isFinite(z)) return;
  rattle.x = clamp(x, -COURSE_HALF_WIDTH - 0.5, COURSE_HALF_WIDTH + 0.5);
  rattle.z = clamp(z, GOAL_Z - 2.5, START_Z + 1.5);
}
function notify(state: RaceState, baby: Baby, text: string, kind = 'normal', eventId?: EventId): void {
  const rt = runtime(state);
  baby.event = text;
  state.events.unshift({ id: ++rt.notificationId, babyId: baby.id, text, kind, time: state.time, ...(eventId ? { eventId } : {}) });
  // Four simultaneous racers and contagion can produce several notifications in
  // one tick. Retain enough history for the UI director to observe every effect.
  state.events.length = Math.min(state.events.length, 24);
}
function setState(baby: Baby, value: BabyState, seconds = 0): void {
  baby.state = value; baby.stateTime = seconds; baby.eventId = null;
  if (value !== 'awakening') delete baby.awakeningPhase;
}
function finishEffect(baby: Baby): void { setState(baby, baby.attention < 0.13 ? 'look' : 'happy'); }
function zoneAt(state: RaceState, baby: Baby): { zone: CourseZone; index: number } | null {
  const zones = getCourse(state.courseId).zones;
  const index = zones.findIndex(zone => baby.z <= zone.zStart && baby.z >= zone.zEnd && Math.abs(baby.x - zone.x) <= zone.width / 2);
  return index < 0 ? null : { zone: zones[index], index };
}
function hearingRange(state: RaceState, baby: Baby): number {
  return HEARING_RANGE * (zoneAt(state, baby)?.zone.kind === 'echo' ? 1.6 : 1);
}
export function ringRattle(state: RaceState, id = 0): boolean {
  if (state.phase !== 'racing' && state.phase !== 'countdown') return false;
  const baby = state.babies[id], rattle = state.rattles[id];
  if (!baby || !rattle || baby.finishedAt !== null) return false;
  const rt = runtime(state), interval = rt.clock - rt.lastAcceptedRing[id];
  if (interval < 0.075) return false;
  rt.lastAcceptedRing[id] = rt.clock; rattle.pulse = 0.48;
  const distance = Math.hypot(rattle.x - baby.x, rattle.z - baby.z);
  if (distance > hearingRange(state, baby) && rt.superUntil[id] < state.time) return true;
  rt.lastRing[id] = rt.clock;
  const spam = interval < 0.38;
  baby.boredom = clamp(baby.boredom + (spam ? 0.19 : 0.015), 0, 1);
  baby.attention = clamp(baby.attention + 0.48 * (1 - baby.boredom * 0.7) * (baby.eventId === 'N05' ? 0.2 : 1), 0, 1);
  baby.mood = clamp(baby.mood + (spam ? -0.045 : 0.035), 0.2, 1);
  if (state.phase === 'countdown') return true;
  if (baby.boredom > 0.77 && state.time >= rt.nextBored[id] && !baby.eventId) {
    if (triggerEvent(state, 'N05', id)) rt.nextBored[id] = state.time + 8;
    return true;
  }
  if (distance < 5 && !spam && baby.eventId !== 'N05' && !baby.eventId?.startsWith('S')) {
    if (baby.state === 'distracted') {
      baby.stateTime = Math.max(0, baby.stateTime - 1.1);
      if (baby.stateTime === 0) finishEffect(baby);
    } else if (baby.state === 'rest') {
      baby.stateTime = baby.stateTime <= 0.95 ? 0 : baby.stateTime - 0.18;
      if (baby.stateTime === 0) finishEffect(baby);
    } else if (baby.state === 'look' && baby.stateTime <= 0.8) finishEffect(baby);
  }
  if (baby.state === 'happy' && !baby.eventId && interval >= 0.65 && interval <= 1.6 && baby.attention > 0.75 && baby.boredom < 0.3 && state.time >= rt.nextGroove[id]) {
    setState(baby, 'groove', 1.7); rt.nextGroove[id] = state.time + 9; notify(state, baby, 'ノリノリ♪', 'good');
  }
  return true;
}
export function useSuper(state: RaceState, id = 0): boolean {
  const baby = state.babies[id];
  if (state.phase !== 'racing' || !baby || baby.superUsed || baby.finishedAt !== null) return false;
  const rt = runtime(state);
  baby.superUsed = true; baby.attention = 1; baby.boredom = 0; baby.mood = 1;
  rt.lastRing[id] = rt.clock; rt.superUntil[id] = state.time + 3.4; state.rattles[id].pulse = 1.3;
  if (!baby.eventId?.startsWith('S')) setState(baby, 'groove', 3.4);
  notify(state, baby, 'スーパーガラガラ！', 'super'); return true;
}
function nearestRival(state: RaceState, baby: Baby): Baby | undefined {
  return state.babies.filter(other => other.id !== baby.id && other.finishedAt === null)
    .sort((a, b) => Math.hypot(a.x - baby.x, a.z - baby.z) - Math.hypot(b.x - baby.x, b.z - baby.z) || a.id - b.id)[0];
}
function applyEffect(state: RaceState, baby: Baby, eventId: EventId, value: BabyState, duration: number): void {
  const rt = runtime(state);
  // The dance has two seconds of movement after its stop; shorten only the
  // stationary part near the goal, preserving the promised dash.
  const finishLimit = eventId === 'S09' ? 2 + 0.65 : 0.65;
  const seconds = NEGATIVE.has(eventId) && baby.z < GOAL_Z + 4 ? Math.min(duration, finishLimit) : duration;
  setState(baby, value, seconds); baby.eventId = eventId;
  rt.effectElapsed[baby.id] = 0; rt.targetBaby[baby.id] = null; rt.eventReady[baby.id] = state.time + seconds + 1.5;
  if (NEGATIVE.has(eventId)) rt.lastNegative[baby.id] = state.time;
  if (eventId.startsWith('S')) {
    baby.awakeningPhase = eventId === 'S01' || eventId === 'S09' ? 'pose' : 'run';
    rt.specialReady[baby.id] = state.time + seconds + 14;
  }
}
/** Catalog/demo and natural schedules use the same guards and effect rules. */
export function triggerEvent(state: RaceState, eventId: EventId, babyId = 0): boolean {
  const baby = state.babies[babyId], definition = getEvent(eventId);
  if (state.phase !== 'racing' || !baby || !definition || baby.finishedAt !== null || baby.eventId || (state.mode === 'skill' && definition.rarity === 'legendary')) return false;
  const rt = runtime(state);
  if (state.time < rt.eventReady[babyId] || (definition.rarity === 'legendary' && state.time < rt.specialReady[babyId]) || (NEGATIVE.has(eventId) && state.time - rt.lastNegative[babyId] < 7)) return false;
  const effect = (value: BabyState, duration: number) => applyEffect(state, baby, eventId, value, duration);
  const rival = nearestRival(state, baby);
  switch (eventId) {
    case 'N01': {
      effect('distracted', 2.9);
      const spot = [...getCourse(state.courseId).duckSpots].sort((a, b) => Math.abs(a.z - baby.z) - Math.abs(b.z - baby.z))[0];
      rt.distraction[babyId] = { x: spot.x, z: clamp(spot.z, baby.z - 1.5, baby.z + 1.5) }; break;
    }
    case 'N02': effect('look', 1.15); break;
    case 'N03': effect('rest', 1.65); break;
    case 'N04': effect('distracted', 2); rt.targetBaby[babyId] = rival?.id ?? null; break;
    case 'N05': effect('look', 1.5); baby.attention = 0.12; baby.boredom = Math.max(baby.boredom, 0.86); break;
    case 'N06': effect('happy', 1.6); baby.heading += Math.PI; break;
    case 'N07': effect('rest', 1); break;
    case 'N08': effect('rest', 0.3); baby.heading += babyId % 2 ? -0.15 : 0.15; break;
    case 'R01': effect('groove', 2.2); break;
    case 'R02': effect('groove', 2.6); break;
    case 'R03': {
      effect('distracted', 2.2); rt.targetBaby[babyId] = rival?.id ?? null;
      if (rival && Math.hypot(rival.x - baby.x, rival.z - baby.z) < 5 && !rival.eventId && state.time >= rt.eventReady[rival.id] && state.time - rt.lastNegative[rival.id] >= 7) {
        applyEffect(state, rival, eventId, 'distracted', 1.5); rt.targetBaby[rival.id] = babyId;
        notify(state, rival, '赤ちゃん渋滞に合流！', 'rare', eventId);
      } break;
    }
    case 'R04': effect('groove', 2); baby.mood = 1; break;
    case 'R05': {
      effect('rest', 0.65);
      for (const other of state.babies) {
        if (other.id === babyId || other.finishedAt !== null || other.eventId || Math.hypot(other.x - baby.x, other.z - baby.z) > 5 || state.time < rt.eventReady[other.id] || state.time - rt.lastNegative[other.id] < 7) continue;
        applyEffect(state, other, eventId, 'rest', 0.85); other.mood = 1;
        notify(state, other, 'つられてキャッキャッ！', 'rare', eventId);
      }
      baby.mood = 1; break;
    }
    case 'R06': effect('happy', 1.5); break;
    case 'R07': effect('distracted', 3); rt.distraction[babyId] = { x: baby.x > 0 ? -4.8 : 4.8, z: baby.z - 0.6 }; break;
    case 'R08': effect('groove', 2.5); baby.attention = 1; break;
    case 'R09': effect('rest', 3); break;
    case 'R10': {
      effect('rest', 2.2);
      baby.mood = Math.max(0.3, baby.mood - 0.18);
      for (const other of state.babies) {
        if (other.id === babyId || other.finishedAt !== null || other.eventId ||
            Math.hypot(other.x - baby.x, other.z - baby.z) > 5.5 ||
            state.time < rt.eventReady[other.id] || state.time - rt.lastNegative[other.id] < 7) continue;
        applyEffect(state, other, eventId, 'rest', 2.2);
        other.mood = Math.max(0.3, other.mood - 0.18);
        notify(state, other, 'えーん！つられてギャン泣き！', 'rare', eventId);
      }
      // The common notification below comes last, keeping the actual initiator
      // newest so the cinematic director can deduplicate the relay correctly.
      break;
    }
    case 'S01': effect('awakening', AWAKE_DURATION); break;
    case 'S02': effect('awakening', 3.2); break;
    case 'S03': effect('awakening', 2.6); break;
    case 'S04': effect('awakening', 2.5); break;
    case 'S05': effect('awakening', 1.05); baby.heading = Math.PI; break;
    case 'S06': effect('awakening', 3.1); break;
    case 'S07': effect('awakening', 2.6); break;
    case 'S08': effect('rest', 1); baby.heading = Math.PI; break;
    case 'S09': effect('awakening', 5); baby.mood = 1; break;
  }
  if (definition.rarity !== 'normal') { baby.attention = Math.max(0.8, baby.attention); rt.lastRing[babyId] = rt.clock; }
  const text = eventId === 'S01' ? '突然立ったーー！！' : definition.name + (definition.name.endsWith('！') ? '' : '！');
  notify(state, baby, text, definition.rarity === 'normal' ? 'warning' : definition.rarity, eventId); return true;
}
export function triggerAwakening(state: RaceState, id = 0): boolean { return triggerEvent(state, 'S01', id); }
export function getProgress(baby: Pick<Baby, 'z'>): number { return clamp((START_Z - baby.z) / COURSE_LENGTH, 0, 1); }
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
function updateCpu(state: RaceState, dt: number): void {
  const rt = runtime(state);
  for (const baby of state.babies) {
    if (!baby.isCpu || baby.finishedAt !== null) continue;
    const id = baby.id, target = state.rattles[id];
    const lane = LANES[id] + Math.sin(state.time * 0.31 + id * 1.4) * 0.55;
    target.x += (lane - target.x) * Math.min(1, dt * 3); target.z = Math.max(GOAL_Z - 2, baby.z - 3.25);
    if (state.time >= rt.cpuRing[id]) { ringRattle(state, id); rt.cpuRing[id] = state.time + 0.94 + random(rt) * 0.36; }
    if (state.time >= rt.cpuSuper[id] && !baby.superUsed) useSuper(state, id);
  }
}
function updateSchedules(state: RaceState): void {
  if (state.mode === 'chaos') {
    // With a short ordinary interval, evaluating minor setbacks first can take
    // every newly available participant and starve a waiting rare spectacle.
    updateLegendarySchedule(state);
    updateRareSchedule(state);
    updateOrdinarySchedules(state);
  } else {
    // Preserve the former chaos ordering and seeded outcomes for normal mode.
    updateOrdinarySchedules(state);
    updateRareSchedule(state);
    updateLegendarySchedule(state);
  }
}
function updateOrdinarySchedules(state: RaceState): void {
  const rt = runtime(state);
  // Keep the next free participant available between the spectacle scheduler's
  // retries instead of immediately spending their protection window on a minor
  // setback. All cooldowns still apply to the waiting effect itself.
  if (state.mode === 'chaos' && (rt.rareWaiting || rt.legendaryWaiting)) return;
  for (const baby of state.babies) {
    if (baby.finishedAt !== null || state.time < rt.nextNormal[baby.id]) continue;
    const eventId = NORMAL_EVENTS[rt.normalCursor[baby.id] % NORMAL_EVENTS.length];
    if (triggerEvent(state, eventId, baby.id)) {
      rt.normalCursor[baby.id] += 1;
      const interval = state.mode === 'chaos' ? 4 + random(rt) * 2 : state.mode === 'normal' ? 7 + random(rt) * 3 : 14 + random(rt) * 4;
      rt.nextNormal[baby.id] = state.time + interval;
    } else rt.nextNormal[baby.id] = state.time + 0.8;
  }
}
function updateRareSchedule(state: RaceState): void {
  const rt = runtime(state);
  if (state.time >= rt.nextRare) {
    const eventId = RARE_EVENTS[rt.rareCursor % RARE_EVENTS.length];
    const choices = scheduledChoices(state, eventId);
    const baby = choices[Math.floor(random(rt) * choices.length)];
    if (baby && triggerEvent(state, eventId, baby.id)) {
      rt.rareWaiting = false;
      rt.rareCursor += 1; rt.rareCount += 1;
      const cap = state.mode === 'chaos' ? 10 : state.mode === 'normal' ? 6 : 2;
      const interval = state.mode === 'chaos' ? 4 + random(rt) * 2 : state.mode === 'normal' ? 7 + random(rt) * 3 : 18 + random(rt) * 3;
      rt.nextRare = rt.rareCount >= cap ? Infinity : state.time + interval;
    } else { rt.rareWaiting = true; rt.nextRare = state.time + 0.8; }
  }
}
function updateLegendarySchedule(state: RaceState): void {
  const rt = runtime(state);
  if (state.time >= rt.nextLegendary) {
    // A finish-line pose must not block every other legendary event early in a
    // race. Defer it to a later legendary slot and show an eligible effect now.
    const deferredChoices = rt.pendingFinishPose ? scheduledChoices(state, 'S08') : [];
    const servingDeferred = deferredChoices.length > 0;
    let eventId = servingDeferred ? 'S08' as EventId : LEGENDARY_EVENTS[rt.legendaryCursor % LEGENDARY_EVENTS.length];
    let choices = servingDeferred ? deferredChoices : scheduledChoices(state, eventId);
    if (eventId === 'S08' && !choices.length) {
      rt.pendingFinishPose = true;
      rt.legendaryCursor += 1;
      eventId = LEGENDARY_EVENTS[rt.legendaryCursor % LEGENDARY_EVENTS.length];
      choices = scheduledChoices(state, eventId);
    }
    const baby = choices[Math.floor(random(rt) * choices.length)];
    if (baby && triggerEvent(state, eventId, baby.id)) {
      rt.legendaryWaiting = false;
      if (!servingDeferred) rt.legendaryCursor += 1;
      if (eventId === 'S08') rt.pendingFinishPose = false;
      rt.nextLegendary = state.mode === 'chaos' ? state.time + 9 + random(rt) * 3 : state.mode === 'normal' ? state.time + 14 + random(rt) * 4 : Infinity;
    } else { rt.legendaryWaiting = true; rt.nextLegendary = state.time + 0.8; }
  }
}
function scheduledChoices(state: RaceState, eventId: EventId): Baby[] {
  const rt = runtime(state);
  return state.babies.filter(baby => baby.finishedAt === null && !baby.eventId && state.time >= rt.eventReady[baby.id] &&
    (!NEGATIVE.has(eventId) || state.time - rt.lastNegative[baby.id] >= 7) &&
    (!eventId.startsWith('S') || state.time >= rt.specialReady[baby.id]) &&
    (eventId !== 'S08' || baby.z < GOAL_Z + 6));
}
function updateBaby(state: RaceState, baby: Baby, dt: number, lastPlaceId: number, leadingProgress: number): void {
  if (baby.finishedAt !== null) return;
  const rt = runtime(state), id = baby.id, entry = zoneAt(state, baby);
  baby.zone = entry?.zone.kind ?? null;
  if ((entry?.index ?? -1) !== rt.zoneIndex[id]) {
    rt.zoneIndex[id] = entry?.index ?? -1;
    if (entry) notify(state, baby, ZONE_LABELS[entry.zone.kind], 'zone');
  }
  baby.boredom = Math.max(0, baby.boredom - dt * 0.105);
  baby.attention = Math.max(0, baby.attention - dt * (baby.boredom > 0.6 ? 0.27 : 0.16));
  baby.mood = Math.max(0.3, baby.mood - dt * 0.002);
  if (baby.stateTime > 0) {
    baby.stateTime = Math.max(0, baby.stateTime - dt); rt.effectElapsed[id] += dt;
    if (baby.stateTime < 1e-8) finishEffect(baby);
  }
  const eventId = baby.eventId;
  if (eventId === 'S01') baby.awakeningPhase = baby.stateTime > AWAKE_RUN + AWAKE_LANDING ? 'pose' : baby.stateTime > AWAKE_LANDING ? 'run' : 'landing';
  if (eventId === 'S09') baby.awakeningPhase = baby.stateTime > 2 + 1e-8 ? 'pose' : 'run';
  if (baby.state === 'rest' || baby.state === 'look' || (baby.state === 'awakening' && baby.awakeningPhase !== 'run')) return;
  const rattle = state.rattles[id], isAwake = baby.state === 'awakening', isSuper = state.time <= rt.superUntil[id], distracted = baby.state === 'distracted';
  const other = rt.targetBaby[id] === null ? undefined : state.babies[rt.targetBaby[id]!];
  const target = distracted ? other ?? rt.distraction[id] : rattle;
  let dx = target.x - baby.x, dz = target.z - baby.z;
  const distance = Math.hypot(dx, dz), recentCall = rt.clock - rt.lastRing[id] < (isSuper ? 4 : baby.zone === 'echo' ? 4.6 : 3.1);
  if (!distracted && !isAwake && !isSuper && eventId !== 'N06' && eventId !== 'R06' && (!recentCall || baby.attention < 0.12 || distance > hearingRange(state, baby))) {
    if (baby.attention < 0.14 || !recentCall) setState(baby, 'look');
    return;
  }
  if (baby.zone === 'toy' && !distracted && !isAwake && entry) {
    const attraction = recentCall && baby.attention > 0.6 ? 0.12 : 0.3;
    dx = dx * (1 - attraction) + (entry.zone.x - baby.x) * attraction;
    dz = dz * (1 - attraction) + ((entry.zone.zStart + entry.zone.zEnd) / 2 - baby.z) * attraction;
  }
  let desired = Math.atan2(dx, -dz), turnRate = isAwake ? 0.9 : 4.3, multiplier = 1;
  switch (eventId) {
    case 'N06': turnRate = 0.7; break;
    case 'R01': multiplier = 1.75; break;
    case 'R02': multiplier = 1.58; turnRate = 0.75; break;
    case 'R04': multiplier = 1.85; break;
    case 'R06': baby.heading += dt * 10; desired = baby.heading; multiplier = 0.18; break;
    case 'R07': multiplier = 1.25; break;
    case 'R08': multiplier = 1.5 + clamp((leadingProgress - getProgress(baby)) * 0.6, 0, 0.15); break;
    case 'S01': multiplier = 2; break;
    case 'S02': multiplier = Math.floor(rt.effectElapsed[id] * 7) % 2 === 0 ? 2.4 : 0.9; turnRate = 0.38; break;
    case 'S03': multiplier = 0.66; desired += Math.sin(rt.effectElapsed[id] * 4) * 0.38; turnRate = 2; break;
    case 'S04': multiplier = 2.2; desired += Math.sin(rt.effectElapsed[id] * 8) * 0.85; turnRate = 8; break;
    case 'S05': multiplier = 1.7; desired = Math.PI; turnRate = 9; break;
    case 'S06': multiplier = 1.7; turnRate = 3.6; break;
    case 'S07': multiplier = 1.6; desired = Math.atan2(dx * 2.5, -dz); turnRate = 8.5; break;
    case 'S09': multiplier = 1.8; turnRate = 2.4; break;
    default: if (baby.state === 'groove') multiplier = 1.24;
  }
  baby.heading = turnTowards(baby.heading, desired, dt * turnRate);
  const catchUp = id === lastPlaceId ? 1 + clamp((leadingProgress - getProgress(baby)) * 0.18, 0, 0.045) : 1;
  let speed = BASE_SPEED * (0.94 + baby.mood * 0.09) * catchUp * multiplier;
  if (isSuper) speed *= isAwake ? 1.05 : 1.42 / (baby.state === 'groove' && !eventId ? 1.24 : 1);
  if (distracted) speed *= eventId === 'R07' ? 0.95 : 0.63;
  if (baby.zone === 'cushion') speed *= 0.64;
  if (baby.zone === 'sprint') speed *= 1.2;
  if (baby.zone === 'toy') speed *= 0.94;
  if (!isAwake && eventId !== 'R06') speed *= clamp((distance - 0.42) / 1.05, 0, 1);
  const previousZ = baby.z;
  const ballNudge = baby.zone === 'ball' ? Math.sin(state.time * 2.6 + id * 2.3) * 0.55 * dt : 0;
  baby.x = clamp(baby.x + Math.sin(baby.heading) * speed * dt + ballNudge, -COURSE_HALF_WIDTH, COURSE_HALF_WIDTH);
  baby.z = clamp(baby.z - Math.cos(baby.heading) * speed * dt, GOAL_Z - 0.1, START_Z + 0.6);
  if (baby.z <= GOAL_Z) {
    const fraction = previousZ === baby.z ? 1 : clamp((previousZ - GOAL_Z) / (previousZ - baby.z), 0, 1);
    baby.finishedAt = state.time - dt + fraction * dt; baby.z = GOAL_Z;
  }
}
function tick(state: RaceState, dt: number): void {
  const rt = runtime(state);
  rt.clock += dt;
  for (const rattle of state.rattles) rattle.pulse = Math.max(0, rattle.pulse - dt);
  if (state.phase === 'countdown') {
    state.countdown = Math.max(0, state.countdown - dt);
    if (state.countdown < 1e-8) {
      state.countdown = 0; state.phase = 'racing'; rt.lastRing = state.babies.map(() => rt.clock);
      notify(state, state.babies[0], 'よーい、ハイハイ！', 'start');
    }
    return;
  }
  if (state.phase !== 'racing') return;
  const raceStep = Math.min(dt, TIME_LIMIT - state.time);
  state.time += raceStep; updateCpu(state, raceStep); updateSchedules(state);
  const rankingBefore = rankBabies(state), lastPlaceId = rankingBefore[rankingBefore.length - 1].id, leadingProgress = getProgress(rankingBefore[0]);
  for (const baby of state.babies) updateBaby(state, baby, raceStep, lastPlaceId, leadingProgress);
  const ranking = rankBabies(state);
  if (ranking[0].finishedAt !== null) {
    state.phase = 'finished'; state.winner = ranking[0].id; state.finishReason = 'goal'; notify(state, ranking[0], 'ゴーーール！', 'finish');
  } else if (state.time >= TIME_LIMIT - 1e-8) {
    state.time = TIME_LIMIT; state.phase = 'finished'; state.winner = ranking[0].id; state.finishReason = 'timeout'; notify(state, ranking[0], 'タイムアップ！', 'finish');
  }
}
/** Fixed 60Hz simulation keeps all AI and event schedules independent of FPS. */
export function updateRace(state: RaceState, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0 || state.phase === 'ready' || state.phase === 'finished') return;
  const rt = runtime(state);
  rt.accumulator += Math.min(dt, 120);
  while (rt.accumulator >= STEP - 1e-10) {
    tick(state, STEP); rt.accumulator = Math.max(0, rt.accumulator - STEP);
    if ((state.phase as Phase) === 'finished') { rt.accumulator = 0; break; }
  }
}
