import { useLang } from '../../i18n/LangContext';
import { widgetText as w } from '../../content/widgets';

const OUTPUTS = [
  { lang: 'Go', files: ['shop.pb.go', 'shop_grpc.pb.go'] },
  { lang: 'Node.js', files: ['@grpc/proto-loader (runtime)', 'or static: shop_pb.js + shop_grpc_pb.js'] },
  { lang: 'Python', files: ['shop_pb2.py', 'shop_pb2_grpc.py'] },
  { lang: 'C#', files: ['Shop.cs', 'ShopGrpc.cs (Grpc.Tools)'] },
];

export function CodegenFlow() {
  const { t } = useLang();
  return (
    <section className="widget">
      <h3>{t(w.flowTitle)}</h3>
      <div className="flow">
        <div className="flow-node src">
          <small>{t(w.flowSource)}</small>
          <code>shop.proto</code>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-node tool">
          <small>{t(w.flowTool)}</small>
          <code>protoc / buf generate</code>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-outs">
          <small>{t(w.flowOut)}</small>
          {OUTPUTS.map((o) => (
            <div key={o.lang} className="flow-out">
              <b>{o.lang}</b>
              {o.files.map((f) => (
                <code key={f}>{f}</code>
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="muted small">{t(w.flowYou)}</p>
    </section>
  );
}
