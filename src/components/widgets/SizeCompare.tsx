import { useMemo, useState } from 'react';
import { useLang } from '../../i18n/LangContext';
import { widgetText as w } from '../../content/widgets';
import { byteLength, hex, orderToJson, orderToProtobuf, sampleOrder } from '../../lib/protobuf';

export function SizeCompare() {
  const { t } = useLang();
  const [count, setCount] = useState(3);
  const [view, setView] = useState<'json' | 'hex'>('json');
  const order = useMemo(() => sampleOrder(count), [count]);
  const json = orderToJson(order);
  const jsonBytes = byteLength(json);
  const pb = orderToProtobuf(order);
  const max = Math.max(jsonBytes, pb.length);
  const saved = Math.round((1 - pb.length / jsonBytes) * 100);

  return (
    <section className="widget">
      <h3>{t(w.sizeTitle)}</h3>
      <label className="control">
        <span>
          {t(w.sizeItems)}: <b>{count}</b>
        </span>
        <input type="range" min={1} max={40} value={count} onChange={(e) => setCount(Number(e.target.value))} />
      </label>
      <div className="bars">
        <div className="bar-row">
          <span className="bar-label">{t(w.sizeJson)}</span>
          <div className="bar-track">
            <div className="bar json" style={{ width: `${(jsonBytes / max) * 100}%` }} />
          </div>
          <b className="bar-num">{jsonBytes} B</b>
        </div>
        <div className="bar-row">
          <span className="bar-label">{t(w.sizeProto)}</span>
          <div className="bar-track">
            <div className="bar proto" style={{ width: `${(pb.length / max) * 100}%` }} />
          </div>
          <b className="bar-num">{pb.length} B</b>
        </div>
      </div>
      <p className="big-stat">
        <b>{saved}%</b> {t(w.sizeSmaller)}
      </p>
      <p className="muted small">{t(w.sizeNote)}</p>
      <div className="seg">
        <button type="button" className={view === 'json' ? 'seg-btn active' : 'seg-btn'} onClick={() => setView('json')}>
          {t(w.sizeShowJson)}
        </button>
        <button type="button" className={view === 'hex' ? 'seg-btn active' : 'seg-btn'} onClick={() => setView('hex')}>
          {t(w.sizeShowHex)}
        </button>
      </div>
      <pre className="dump">{view === 'json' ? orderToJson(order, true) : hex(pb)}</pre>
    </section>
  );
}
