import { getEvent, type EventId } from './content.ts';
import type { RaceEvent } from './simulation.ts';

export interface CinematicFrame {
  readonly babyId: number;
  readonly eventId: EventId;
  readonly elapsed: number;
  readonly duration: number;
  readonly amount: number;
  readonly phase: 'enter' | 'hold' | 'exit';
}
export const CINEMATIC_TIMING = { enter: 0.45, exit: 0.55, rare: 2.6, legendary: 3.2 } as const;
const EVENT_DURATION: Partial<Record<EventId, number>> = { R09: 4.2, R10: 3.6, S09: 4.6 };
interface Shot { babyId: number; eventId: EventId; elapsed: number; duration: number }
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

/** Presentation owns its clock; advancing a cut never advances race rules. */
export class CinematicDirector {
  private current: Shot | null = null;
  private queued: Shot[] = [];
  private seenNotification = 0;
  private seenOccurrences = new Set<string>();

  get active(): boolean { return this.current !== null; }
  get frame(): CinematicFrame | null {
    const shot = this.current;
    if (!shot) return null;
    const phase = shot.elapsed < CINEMATIC_TIMING.enter ? 'enter' : shot.elapsed >= shot.duration - CINEMATIC_TIMING.exit ? 'exit' : 'hold';
    const amount = phase === 'enter' ? smooth(shot.elapsed / CINEMATIC_TIMING.enter) : phase === 'exit' ? 1 - smooth((shot.elapsed - shot.duration + CINEMATIC_TIMING.exit) / CINEMATIC_TIMING.exit) : 1;
    return { ...shot, amount, phase };
  }

  observe(events: readonly RaceEvent[], racing: boolean): void {
    const fresh = events.filter(event => event.id > this.seenNotification);
    for (const event of fresh) this.seenNotification = Math.max(this.seenNotification, event.id);
    if (!racing) return;
    // Contagious laughter/traffic notify several babies: show the initiating
    // baby (last notification), once for the shared occurrence.
    const candidates = fresh.filter(event => event.eventId && getEvent(event.eventId).rarity !== 'normal')
      .sort((a,b) => Number(b.eventId!.startsWith('S')) - Number(a.eventId!.startsWith('S')) || b.id - a.id);
    for (const event of candidates) {
      const eventId = event.eventId!;
      const key = `${eventId}:${event.time}`;
      if (this.seenOccurrences.has(key)) continue;
      this.seenOccurrences.add(key);
      const shot: Shot = { babyId: event.babyId, eventId, elapsed: 0, duration: EVENT_DURATION[eventId] ?? (eventId.startsWith('S') ? CINEMATIC_TIMING.legendary : CINEMATIC_TIMING.rare) };
      if (!this.current) this.current = shot;
      else if (this.queued.length < 3) this.queued.push(shot);
    }
  }

  advance(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    if (!this.current) return;
    // Render the exact saved camera (amount=0) for one frame before releasing
    // the race clock. Otherwise a low-FPS exit can skip its final 10% of zoom.
    if (this.current.elapsed >= this.current.duration) { this.current = this.queued.shift() ?? null; return; }
    this.current.elapsed = Math.min(this.current.duration, this.current.elapsed + seconds);
  }

  /** Even an early skip keeps the camera's current blend continuous. */
  skip(): void {
    if (!this.current) return;
    const shot = this.current;
    if (shot.elapsed < CINEMATIC_TIMING.enter) shot.elapsed = shot.duration - CINEMATIC_TIMING.exit * (shot.elapsed / CINEMATIC_TIMING.enter);
    else if (shot.elapsed < shot.duration - CINEMATIC_TIMING.exit) shot.elapsed = shot.duration - CINEMATIC_TIMING.exit;
  }

  reset(): void {
    this.current = null;
    this.queued = [];
    this.seenNotification = 0;
    this.seenOccurrences.clear();
  }
}
