import type { Actor } from '../../lib/types';
import { useLang } from '../../i18n/LangContext';
import { progress, type TimedEvent } from './engine';

const W = 760;
const PAD = 90;
const HEAD = 64;
const ROW = 44;

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

interface Props {
  actors: Actor[];
  events: TimedEvent[];
  t: number;
  selected: number | null;
  onSelect: (index: number) => void;
}

export function SequenceDiagram({ actors, events, t, selected, onSelect }: Props) {
  const { t: tr } = useLang();
  const n = actors.length;
  const gap = n > 1 ? (W - PAD * 2) / (n - 1) : 0;
  const xOf = (id: string) => {
    const i = actors.findIndex((a) => a.id === id);
    return n > 1 ? PAD + i * gap : W / 2;
  };
  const height = HEAD + events.length * ROW + 24;
  const maxLabel = Math.max(18, Math.floor((gap || W) / 7.4));

  return (
    <div className="diagram-scroll">
      <svg className="diagram" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="sequence diagram">
        <defs>
          {['headers', 'data', 'trailers', 'error', 'ping', 'tls', 'http', 's1', 's3', 's5', 's7'].map((k) => (
            <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className={`fill-${k}`} />
            </marker>
          ))}
        </defs>

        {actors.map((a) => {
          const x = xOf(a.id);
          const label = tr(a.label);
          const boxW = Math.min(Math.max(label.length * 8.6 + 26, 92), gap ? gap - 10 : 200);
          return (
            <g key={a.id}>
              <line x1={x} x2={x} y1={HEAD - 8} y2={height - 6} className="lifeline" />
              <rect x={x - boxW / 2} y={10} width={boxW} height={36} rx={9} className="actor-box" />
              <text x={x} y={33} textAnchor="middle" className="actor-text">
                {clip(label, 22)}
              </text>
            </g>
          );
        })}

        {events.map((ev) => {
          const p = progress(ev, t);
          if (p <= 0) return null;
          const y = HEAD + ev.index * ROW + 26;
          const tone = ev.stream ? `s${ev.stream}` : ev.kind;
          const isSel = selected === ev.index;
          const hit = (
            <rect x={0} y={y - 22} width={W} height={ROW - 2} className={isSel ? 'row-hit sel' : 'row-hit'} onClick={() => onSelect(ev.index)} />
          );

          if (ev.from === ev.to || ev.kind === 'note') {
            const x = xOf(ev.from);
            const text = clip(ev.label, 46);
            const w = Math.min(text.length * 7 + 22, W - 20);
            const left = Math.min(Math.max(x - w / 2, 6), W - w - 6);
            return (
              <g key={ev.index} className="ev note-ev" style={{ opacity: p }}>
                {hit}
                <rect x={left} y={y - 15} width={w} height={26} rx={6} className={`note-box tone-${ev.kind}`} />
                <text x={left + w / 2} y={y + 2} textAnchor="middle" className="note-text">
                  {text}
                </text>
              </g>
            );
          }

          const x1 = xOf(ev.from);
          const x2 = xOf(ev.to);
          const xe = x1 + (x2 - x1) * p;
          const mid = (x1 + x2) / 2;
          const label = (ev.stream ? `#${ev.stream} ` : '') + ev.label;
          return (
            <g key={ev.index} className="ev">
              {hit}
              <line
                x1={x1}
                x2={xe}
                y1={y}
                y2={y}
                className={`arrow stroke-${tone}`}
                markerEnd={p >= 1 ? `url(#arrow-${tone})` : undefined}
              />
              {p < 1 && <circle cx={xe} cy={y} r={6} className={`packet fill-${tone}`} />}
              <text x={mid} y={y - 8} textAnchor="middle" className="arrow-label" style={{ opacity: Math.min(1, p * 2) }}>
                {clip(label, Math.floor((Math.abs(x2 - x1) + 30) / 7.2) || maxLabel)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
