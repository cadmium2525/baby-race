import { ACCESSORIES, COURSES, DEFAULT_STYLES, EVENTS, type BabyStyle, type CourseId, type EventId } from './content';
import type { Mode } from './simulation';

export interface Preferences { humanPlayers: number; mode: Mode; courseId: CourseId; styles: BabyStyle[]; commentary: boolean; sound: boolean }
export interface Records { races: number; wins: number; seen: EventId[] }
const read = (key: string): unknown => { try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing still supports a complete race. */ } };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
export function loadPreferences(): Preferences {
  const data = object(read('baby-race-settings-v2'));
  const styles = Array.isArray(data.styles) ? data.styles : [];
  return {
    humanPlayers: [1,2,3,4].includes(Number(data.humanPlayers)) ? Number(data.humanPlayers) : 1,
    mode: ['normal','chaos','skill'].includes(String(data.mode)) ? data.mode as Mode : 'normal',
    courseId: COURSES.some(c=>c.id===data.courseId) ? data.courseId as CourseId : 'nursery',
    commentary: data.commentary === true, sound: data.sound !== false,
    styles: DEFAULT_STYLES.map((base, i) => {
      const value = object(styles[i]);
      return { name: typeof value.name === 'string' && value.name.trim() ? value.name.replace(/[\u0000-\u001f]/g,'').trim().slice(0,12) : base.name,
        color: typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : base.color,
        accessory: ACCESSORIES.includes(value.accessory as typeof ACCESSORIES[number]) ? value.accessory as typeof ACCESSORIES[number] : base.accessory };
    }),
  };
}
export const savePreferences = (data: Preferences) => write('baby-race-settings-v2',data);
export function loadRecords(): Records {
  const data = object(read('baby-race-records-v2'));
  return { races: Number.isSafeInteger(data.races) && Number(data.races)>=0 ? Number(data.races) : 0,
    wins: Number.isSafeInteger(data.wins) && Number(data.wins)>=0 ? Number(data.wins) : 0,
    seen: Array.isArray(data.seen) ? [...new Set(data.seen)].filter(id=>EVENTS.some(e=>e.id===id)) as EventId[] : [] };
}
export const saveRecords = (data: Records) => write('baby-race-records-v2',data);
