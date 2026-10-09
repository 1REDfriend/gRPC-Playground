import type { SimEvent } from '../../lib/types';

export const DEFAULT_DUR = 650;
export const NOTE_DUR = 300;

export interface TimedEvent extends SimEvent {
  index: number;
  dur: number;
  end: number;
}

export function normalize(events: SimEvent[]): TimedEvent[] {
  return [...events]
    .sort((a, b) => a.at - b.at)
    .map((ev, index) => {
      const dur = ev.from === ev.to || ev.kind === 'note' ? NOTE_DUR : (ev.dur ?? DEFAULT_DUR);
      return { ...ev, index, dur, end: ev.at + dur };
    });
}

export function totalTime(events: TimedEvent[]): number {
  return events.reduce((max, ev) => Math.max(max, ev.end), 0);
}

/** 0 before the event starts, 1 once it has arrived. */
export function progress(ev: TimedEvent, t: number): number {
  if (t <= ev.at) return 0;
  if (t >= ev.end) return 1;
  return (t - ev.at) / ev.dur;
}

/** Time at which the next not-yet-finished event completes. */
export function nextStop(events: TimedEvent[], t: number): number {
  const pending = events.filter((ev) => ev.end > t + 0.5);
  if (pending.length === 0) return totalTime(events);
  const firstStart = Math.min(...pending.map((ev) => (ev.at > t ? ev.at : t)));
  const group = pending.filter((ev) => ev.at <= firstStart + 0.5);
  return Math.max(...group.map((ev) => ev.end));
}

export function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}
