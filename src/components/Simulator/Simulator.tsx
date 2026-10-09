import { useEffect, useMemo, useRef, useState } from 'react';
import type { Params, SimSpec } from '../../lib/types';
import { useLang } from '../../i18n/LangContext';
import { frameKindLabel, ui } from '../../i18n/ui';
import { formatMs, nextStop, normalize, totalTime } from './engine';
import { SequenceDiagram } from './SequenceDiagram';

const SPEEDS = [0.5, 1, 2];

function defaults(spec: SimSpec): Params {
  const p: Params = {};
  for (const c of spec.controls ?? []) p[c.id] = c.default;
  return p;
}

export function Simulator({ spec }: { spec: SimSpec }) {
  const { t: tr } = useLang();
  const [params, setParams] = useState<Params>(() => defaults(spec));
  const scenario = useMemo(() => spec.build(params), [spec, params]);
  const events = useMemo(() => normalize(scenario.events), [scenario]);
  const end = totalTime(events);

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const logRef = useRef<HTMLOListElement>(null);

  // Reset playback whenever the scenario (or one of its parameters) changes.
  useEffect(() => {
    setTime(0);
    setSelected(null);
  }, [scenario]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setTime((prev) => {
        const next = prev + dt * speed;
        if (next >= end) {
          setPlaying(false);
          return end;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, end]);

  const finished = end > 0 && time >= end;
  const started = events.filter((ev) => ev.at < time || finished);
  const shownIndex = selected ?? (started.length ? started[started.length - 1].index : null);
  const shown = shownIndex === null ? null : events[shownIndex];

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [started.length]);

  const play = () => {
    if (finished) setTime(0);
    setSelected(null);
    setPlaying(true);
  };
  const step = () => {
    setPlaying(false);
    setSelected(null);
    setTime((prev) => (prev >= end ? nextStop(events, -1) : nextStop(events, prev)));
  };
  const reset = () => {
    setPlaying(false);
    setSelected(null);
    setTime(0);
  };
  const change = (id: string, value: string | number) => {
    setParams((prev) => ({ ...prev, [id]: value }));
    setSelected(null);
    setPlaying(true);
  };
  const pick = (index: number) => {
    setPlaying(false);
    setSelected(index);
  };

  const kinds = Array.from(new Set(events.filter((e) => e.kind !== 'note' && !e.stream).map((e) => e.kind)));
  const toneOf = (ev: { stream?: number; kind: string }) => (ev.stream ? `s${ev.stream}` : ev.kind);

  return (
    <section className="sim">
      {spec.controls && spec.controls.length > 0 && (
        <div className="sim-controls">
          {spec.controls.map((c) =>
            c.kind === 'select' ? (
              <div key={c.id} className="control">
                <span>{tr(c.label)}</span>
                <div className="seg">
                  {c.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={params[c.id] === o.value ? 'seg-btn active' : 'seg-btn'}
                      onClick={() => change(c.id, o.value)}
                    >
                      {tr(o.label)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <label key={c.id} className="control">
                <span>
                  {tr(c.label)}: <b>{params[c.id]}{c.unit}</b>
                </span>
                <input
                  type="range"
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={Number(params[c.id])}
                  onChange={(e) => change(c.id, Number(e.target.value))}
                />
              </label>
            ),
          )}
        </div>
      )}

      <div className="sim-bar">
        {playing ? (
          <button type="button" className="btn primary" onClick={() => setPlaying(false)}>
            ❚❚ {tr(ui.pause)}
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={play}>
            ▶ {tr(ui.play)}
          </button>
        )}
        <button type="button" className="btn" onClick={step}>
          ⏭ {tr(ui.step)}
        </button>
        <button type="button" className="btn" onClick={reset}>
          ↺ {tr(ui.reset)}
        </button>
        <div className="speed">
          <span>{tr(ui.speed)}</span>
          {SPEEDS.map((s) => (
            <button key={s} type="button" className={s === speed ? 'seg-btn active' : 'seg-btn'} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
        <div className="timebar" aria-hidden>
          <div className="timebar-fill" style={{ width: `${end ? (Math.min(time, end) / end) * 100 : 0}%` }} />
        </div>
      </div>

      <SequenceDiagram actors={scenario.actors} events={events} t={time} selected={shownIndex} onSelect={pick} />

      {finished && scenario.outcome && (
        <div className={scenario.outcome.ok ? 'outcome ok' : 'outcome bad'}>{tr(scenario.outcome.text)}</div>
      )}

      <div className="sim-panels">
        <div className="panel">
          <h4>{tr(ui.eventLog)}</h4>
          <ol className="log" ref={logRef}>
            {started.length === 0 && <li className="muted">{tr(ui.logEmpty)}</li>}
            {started.map((ev) => (
              <li key={ev.index} className={ev.index === shownIndex ? 'log-item sel' : 'log-item'} onClick={() => pick(ev.index)}>
                <span className="log-time">{formatMs(ev.at)}</span>
                <span className={`chip tone-${toneOf(ev)}`}>{ev.kind === 'note' ? 'note' : ev.kind}</span>
                <span className="log-text">
                  <code>{ev.label}</code>
                  {ev.note && <span className="log-note">{tr(ev.note)}</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="panel">
          <h4>{tr(ui.inspector)}</h4>
          {shown ? (
            <div className="inspector">
              <div className="insp-head">
                <span className={`chip tone-${toneOf(shown)}`}>{shown.kind}</span>
                <code>{shown.from === shown.to ? shown.from : `${shown.from} → ${shown.to}`}</code>
              </div>
              <pre>{shown.detail ?? shown.label}</pre>
              {shown.note && <p>{tr(shown.note)}</p>}
            </div>
          ) : (
            <p className="muted">{tr(ui.inspectorEmpty)}</p>
          )}
          {kinds.length > 0 && (
            <div className="legend">
              <span className="muted">{tr(ui.legendTitle)}:</span>
              {kinds.map((k) => (
                <span key={k} className={`chip tone-${k}`}>
                  {frameKindLabel[k] ? tr(frameKindLabel[k]) : k}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
