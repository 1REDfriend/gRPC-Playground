import type { SimEvent, TopicModule } from '../../../lib/types';
import { CLIENT, l } from '../../shared';

const BACKENDS = ['a', 'b', 'c'];
const IPS: Record<string, string> = { a: '10.0.0.11', b: '10.0.0.12', c: '10.0.0.13' };

const topic: TopicModule = {
  slug: 'load-balancing',
  sim: {
    controls: [
      {
        kind: 'select',
        id: 'policy',
        label: l('นโยบาย load balancing', 'Load-balancing policy'),
        default: 'round_robin',
        options: [
          { value: 'pick_first', label: l('pick_first (ค่าเริ่มต้น)', 'pick_first (default)') },
          { value: 'round_robin', label: l('round_robin', 'round_robin') },
        ],
      },
    ],
    build: (p) => {
      const rr = p.policy === 'round_robin';
      const events: SimEvent[] = [
        {
          at: 0,
          from: 'client',
          to: 'dns',
          kind: 'headers',
          label: 'resolve dns:///orders.internal',
          detail: 'target = dns:///orders.internal:50051',
          note: l('resolver ถาม DNS ว่าชื่อนี้มีกี่ IP', 'The resolver asks DNS which IPs sit behind the name.'),
        },
        {
          at: 650,
          from: 'dns',
          to: 'client',
          kind: 'data',
          label: 'A records: .11 .12 .13',
          detail: 'orders.internal.  30  IN  A  10.0.0.11\norders.internal.  30  IN  A  10.0.0.12\norders.internal.  30  IN  A  10.0.0.13',
          note: l('ได้ backend มาสามตัว', 'Three backends come back.'),
        },
      ];
      const connected = rr ? BACKENDS : ['a'];
      connected.forEach((b, i) => {
        events.push({
          at: 1400 + i * 150,
          from: 'client',
          to: b,
          kind: 'tls',
          label: `connect ${IPS[b]}`,
          note:
            i === 0
              ? rr
                ? l('round_robin เปิด connection ไปหาทุกตัว', 'round_robin connects to every backend.')
                : l('pick_first เปิด connection ไปตัวแรกที่ต่อได้ตัวเดียว', 'pick_first connects to the first backend that works, and only that one.')
              : undefined,
        });
      });
      for (let i = 0; i < 6; i++) {
        const target = rr ? BACKENDS[i % 3] : 'a';
        const at = 2400 + i * 420;
        events.push({ at, from: 'client', to: target, kind: 'data', label: `GetOrder #${i + 1}`, detail: `stream ${i * 2 + 1} → ${IPS[target]}` });
        events.push({ at: at + 900, from: target, to: 'client', kind: 'trailers', label: `OK #${i + 1}`, detail: 'grpc-status = 0' });
      }
      const last = 2400 + 5 * 420 + 1600;
      events.push({
        at: last,
        from: 'client',
        to: 'client',
        kind: 'note',
        label: rr ? 'load: A=2 B=2 C=2' : 'load: A=6 B=0 C=0',
        note: rr
          ? l('งานกระจายเท่า ๆ กัน', 'Work is spread evenly.')
          : l('ทุก call ไปตัวเดียว อีกสองตัวว่าง', 'Every call hit one backend; the other two sat idle.'),
      });
      return {
        actors: [
          CLIENT,
          { id: 'dns', label: l('DNS', 'DNS') },
          { id: 'a', label: l('Backend A', 'Backend A') },
          { id: 'b', label: l('Backend B', 'Backend B') },
          { id: 'c', label: l('Backend C', 'Backend C') },
        ],
        events,
        outcome: rr
          ? { ok: true, text: l('round_robin: กระจายครบสามตัว', 'round_robin: spread across all three') }
          : { ok: false, text: l('pick_first: โหลดกองอยู่ที่ตัวเดียว', 'pick_first: all load on one backend') },
      };
    },
  },
  code: [
    {
      id: 'go',
      lang: 'go',
      code: `// "dns:///" makes the client resolve every address and balance across them itself.
conn, err := grpc.NewClient("dns:///orders.internal:50051",
	grpc.WithTransportCredentials(creds),
	grpc.WithDefaultServiceConfig(\`{"loadBalancingConfig": [{"round_robin": {}}]}\`),
)`,
    },
    {
      id: 'node',
      lang: 'typescript',
      code: `const client = new shop.OrderService('dns:///orders.internal:50051', creds, {
  'grpc.service_config': JSON.stringify({
    loadBalancingConfig: [{ round_robin: {} }],
  }),
});`,
    },
    {
      id: 'python',
      lang: 'python',
      code: `channel = grpc.secure_channel("dns:///orders.internal:50051", creds, options=[
    ("grpc.lb_policy_name", "round_robin"),
])`,
    },
    {
      id: 'csharp',
      lang: 'csharp',
      code: `using Grpc.Core;
using Grpc.Net.Client;
using Grpc.Net.Client.Configuration;

var channel = GrpcChannel.ForAddress("dns:///orders.internal:5001", new GrpcChannelOptions
{
    Credentials = ChannelCredentials.SecureSsl,
    ServiceConfig = new ServiceConfig { LoadBalancingConfigs = { new RoundRobinConfig() } },
});`,
    },
    {
      id: 'config',
      lang: 'yaml',
      label: 'Kubernetes',
      code: `# A headless Service (clusterIP: None) makes DNS return every pod IP
# instead of one virtual IP, so client-side round_robin can see all pods.
apiVersion: v1
kind: Service
metadata:
  name: orders
spec:
  clusterIP: None
  selector:
    app: orders
  ports:
    - name: grpc
      port: 50051
      targetPort: 50051
# client target: dns:///orders.default.svc.cluster.local:50051`,
    },
  ],
};

export default topic;
