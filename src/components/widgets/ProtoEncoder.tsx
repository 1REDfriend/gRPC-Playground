import { useState } from 'react';
import { useLang } from '../../i18n/LangContext';
import { widgetText as w } from '../../content/widgets';
import { flatten, hex, stringField, varintField, type Segment } from '../../lib/protobuf';

const PROTO = `message Item {
  string sku       = 1;
  int32  quantity  = 2;
  bool   gift_wrap = 3;
}`;

const INT32_MAX = 2147483647;

export function ProtoEncoder() {
  const { t } = useLang();
  const [sku, setSku] = useState('SKU-1007');
  const [quantity, setQuantity] = useState(150);
  const [gift, setGift] = useState(true);

  const segments: Segment[] = [
    ...stringField('sku', 1, sku),
    ...varintField('quantity', 2, quantity),
    ...varintField('gift_wrap', 3, gift),
  ];
  const total = flatten(segments).length;
  const roleLabel = { tag: t(w.roleTag), len: t(w.roleLen), value: t(w.roleValue) };

  return (
    <section className="widget">
      <h3>{t(w.encTitle)}</h3>
      <div className="enc-grid">
        <pre className="dump proto-src">{PROTO}</pre>
        <div className="enc-inputs">
          <label className="field">
            <code>sku</code>
            <input value={sku} maxLength={40} onChange={(e) => setSku(e.target.value)} />
          </label>
          <label className="field">
            <code>quantity</code>
            <input
              type="number"
              min={0}
              max={INT32_MAX}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(0, Math.min(INT32_MAX, Math.floor(Number(e.target.value) || 0))))}
            />
          </label>
          <label className="field check">
            <input type="checkbox" checked={gift} onChange={(e) => setGift(e.target.checked)} />
            <code>gift_wrap</code>
          </label>
        </div>
      </div>

      <h4>
        {t(w.encBytes)} · {t(w.encTotal)} {total} B
      </h4>
      <div className="byte-strip">
        {segments.length === 0 && <span className="muted">(0 bytes)</span>}
        {segments.map((s, i) => (
          <span key={i} className={`bytes role-${s.role}`} title={s.explain}>
            {hex(s.bytes)}
          </span>
        ))}
      </div>
      <div className="table-wrap">
        <table className="seg-table">
          <tbody>
            {segments.map((s, i) => (
              <tr key={i}>
                <td>
                  <span className={`chip role-${s.role}`}>{roleLabel[s.role]}</span>
                </td>
                <td>
                  <code>{s.field}</code>
                </td>
                <td className="mono">{hex(s.bytes.slice(0, 12)) + (s.bytes.length > 12 ? ' …' : '')}</td>
                <td className="mono small">{s.explain}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">{t(w.encDefaults)}</p>
    </section>
  );
}
