import type { SimEvent, TopicModule } from '../../../lib/types';
import { CLIENT, SERVER, l, requestHeaders, trailers } from '../../shared';

const MAX_ATTEMPTS = 4;

function retryScenario(failures: number): { events: SimEvent[]; ok: boolean } {
  const events: SimEvent[] = [];
  let t = 0;
  let backoff = 500;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const fail = attempt <= failures;
    const extra = attempt > 1 ? [`grpc-previous-rpc-attempts = ${attempt - 1}`] : [];
    events.push({
      at: t,
      from: 'client',
      to: 'server',
      kind: 'headers',
      label: `attempt ${attempt}: GetOrder`,
      detail: requestHeaders('GetOrder', extra),
      note: attempt === 1 ? l('ส่ง request ครั้งแรก', 'First attempt.') : l(`ลองใหม่ครั้งที่ ${attempt - 1} (library ทำให้เอง)`, `Retry #${attempt - 1}, done by the library.`),
    });
    t += 900;
    if (fail) {
      events.push({
        at: t,
        from: 'server',
        to: 'client',
        kind: 'error',
        label: 'grpc-status 14 UNAVAILABLE',
        detail: trailers(14, 'connection to database lost'),
        note: l('UNAVAILABLE อยู่ในรายการ retryableStatusCodes', 'UNAVAILABLE is in retryableStatusCodes.'),
      });
      t += 650;
      if (attempt === MAX_ATTEMPTS) {
        events.push({
          at: t,
          from: 'client',
          to: 'client',
          kind: 'error',
          label: `maxAttempts=${MAX_ATTEMPTS} reached → UNAVAILABLE`,
          note: l('ลองครบจำนวนแล้ว ส่ง error ให้โค้ดของคุณ', 'Out of attempts; your code gets the error.'),
        });
        return { events, ok: false };
      }
      const jitter = Math.round(backoff * (0.6 + 0.4 * ((attempt * 37) % 10) / 10));
      events.push({
        at: t,
        from: 'client',
        to: 'client',
        kind: 'note',
        label: `backoff ≈ ${jitter} ms (×2 each time, random jitter)`,
        note: l('รอก่อนลองใหม่ ระยะรอเพิ่มเป็นเท่าตัว และสุ่มให้ไม่ตรงกัน', 'Wait before retrying. The wait doubles and is randomised.'),
      });
      t += jitter;
      backoff *= 2;
    } else {
      events.push({
        at: t,
        from: 'server',
        to: 'client',
        kind: 'trailers',
        label: 'Order + grpc-status 0',
        detail: 'DATA Order{...}\n' + trailers(0),
        note: attempt > 1 ? l('สำเร็จ โค้ดของคุณไม่รู้ด้วยซ้ำว่ามีการ retry', 'Success. Your code never even sees the retries.') : undefined,
      });
      return { events, ok: true };
    }
  }
  return { events, ok: false };
}

function keepaliveScenario(): SimEvent[] {
  const ping = (at: number, n: number): SimEvent[] => [
    {
      at,
      from: 'client',
      to: 'server',
      kind: 'ping',
      label: 'PING',
      detail: `PING frame\nopaque data = 0x000000000000000${n}`,
      note: n === 1 ? l('connection ว่างนานครบ keepalive time client เลยส่ง PING', 'The connection was idle for the keepalive time, so the client pings.') : undefined,
    },
    { at: at + 700, from: 'server', to: 'client', kind: 'ping', label: 'PING ACK', detail: `PING frame, flags: ACK\nopaque data = 0x000000000000000${n}` },
  ];
  return [
    { at: 0, from: 'client', to: 'client', kind: 'note', label: 'connection idle (no RPCs)' },
    ...ping(400, 1),
    ...ping(2100, 2),
    {
      at: 3500,
      from: 'server',
      to: 'server',
      kind: 'error',
      label: 'NAT / load balancer silently drops the connection',
      note: l('connection ตายเงียบ ๆ ไม่มีใครส่งสัญญาณบอก', 'The connection dies silently. Nobody sends a signal.'),
    },
    { at: 3900, from: 'client', to: 'server', kind: 'ping', label: 'PING', dur: 1600, detail: 'PING frame\nopaque data = 0x0000000000000003\n\n(never answered)' },
    {
      at: 5600,
      from: 'client',
      to: 'client',
      kind: 'error',
      label: 'no ACK within keepalive timeout → close',
      note: l('ไม่ได้ ACK ภายในเวลาที่ตั้งไว้ client รู้ทันทีว่า connection ตายแล้ว', 'No ACK in time: the client knows the connection is dead.'),
    },
    {
      at: 6000,
      from: 'client',
      to: 'server',
      kind: 'headers',
      label: 'reconnect → new connection, next RPC works',
      note: l('เปิด connection ใหม่ก่อนที่ผู้ใช้จะเจอ call ที่ค้าง', 'A fresh connection is ready before any user call hangs.'),
    },
  ];
}

const topic: TopicModule = {
  slug: 'retries-keepalive',
  sim: {
    controls: [
      {
        kind: 'select',
        id: 'mode',
        label: l('ดูเรื่องไหน', 'Show'),
        default: 'retry',
        options: [
          { value: 'retry', label: l('Retry', 'Retry') },
          { value: 'keepalive', label: l('Keepalive', 'Keepalive') },
        ],
      },
      { kind: 'range', id: 'failures', label: l('server พังกี่ครั้งก่อนกลับมา (โหมด Retry)', 'Failures before recovery (Retry mode)'), min: 0, max: 4, step: 1, default: 2 },
    ],
    build: (p) => {
      if (p.mode === 'keepalive') {
        return {
          actors: [CLIENT, SERVER],
          events: keepaliveScenario(),
          outcome: { ok: true, text: l('เจอ connection ตายก่อนผู้ใช้จะเจอ', 'Dead connection found before a user hit it.') },
        };
      }
      const failures = Number(p.failures);
      const { events, ok } = retryScenario(failures);
      return {
        actors: [CLIENT, SERVER],
        events,
        outcome: ok
          ? failures === 0
            ? { ok: true, text: l('สำเร็จตั้งแต่ครั้งแรก ไม่ต้อง retry', 'Worked first time; no retry needed') }
            : { ok: true, text: l(`สำเร็จหลัง retry อัตโนมัติ ${failures} ครั้ง`, `Succeeded after ${failures} automatic ${failures === 1 ? 'retry' : 'retries'}`) }
          : { ok: false, text: l(`ลองครบ ${MAX_ATTEMPTS} ครั้งแล้วยังไม่ได้`, `Gave up after ${MAX_ATTEMPTS} attempts`) },
      };
    },
  },
  code: [
    {
      id: 'config',
      lang: 'json',
      label: 'service config',
      code: `{
  "methodConfig": [
    {
      "name": [{ "service": "shop.v1.OrderService", "method": "GetOrder" }],
      "timeout": "2s",
      "retryPolicy": {
        "maxAttempts": 4,
        "initialBackoff": "0.5s",
        "maxBackoff": "5s",
        "backoffMultiplier": 2,
        "retryableStatusCodes": ["UNAVAILABLE"]
      }
    }
  ]
}`,
    },
    {
      id: 'go',
      lang: 'go',
      code: `const serviceConfig = \`{
  "methodConfig": [{
    "name": [{"service": "shop.v1.OrderService", "method": "GetOrder"}],
    "retryPolicy": {
      "maxAttempts": 4,
      "initialBackoff": "0.5s",
      "maxBackoff": "5s",
      "backoffMultiplier": 2,
      "retryableStatusCodes": ["UNAVAILABLE"]
    }
  }]
}\`

conn, err := grpc.NewClient("orders.internal:50051",
	grpc.WithTransportCredentials(creds),
	grpc.WithDefaultServiceConfig(serviceConfig),
	grpc.WithKeepaliveParams(keepalive.ClientParameters{
		Time:                30 * time.Second, // ping after 30s of inactivity
		Timeout:             10 * time.Second, // dead if no ACK within 10s
		PermitWithoutStream: true,             // ping even when no RPC is active
	}),
)

// Server: allow those pings, or it will close the connection with "too_many_pings"
s := grpc.NewServer(
	grpc.KeepaliveEnforcementPolicy(keepalive.EnforcementPolicy{
		MinTime:             20 * time.Second,
		PermitWithoutStream: true,
	}),
)`,
    },
    {
      id: 'node',
      lang: 'typescript',
      code: `const serviceConfig = {
  methodConfig: [
    {
      name: [{ service: 'shop.v1.OrderService', method: 'GetOrder' }],
      retryPolicy: {
        maxAttempts: 4,
        initialBackoff: '0.5s',
        maxBackoff: '5s',
        backoffMultiplier: 2,
        retryableStatusCodes: ['UNAVAILABLE'],
      },
    },
  ],
};

const client = new shop.OrderService('orders.internal:50051', creds, {
  'grpc.service_config': JSON.stringify(serviceConfig),
  'grpc.keepalive_time_ms': 30_000,
  'grpc.keepalive_timeout_ms': 10_000,
  'grpc.keepalive_permit_without_calls': 1,
});

// Server side
const server = new grpc.Server({
  'grpc.keepalive_permit_without_calls': 1,
  'grpc.http2.min_ping_interval_without_data_ms': 20_000,
});`,
    },
    {
      id: 'python',
      lang: 'python',
      code: `import json
import grpc

service_config = {
    "methodConfig": [{
        "name": [{"service": "shop.v1.OrderService", "method": "GetOrder"}],
        "retryPolicy": {
            "maxAttempts": 4,
            "initialBackoff": "0.5s",
            "maxBackoff": "5s",
            "backoffMultiplier": 2,
            "retryableStatusCodes": ["UNAVAILABLE"],
        },
    }]
}

channel = grpc.secure_channel("orders.internal:50051", creds, options=[
    ("grpc.service_config", json.dumps(service_config)),
    ("grpc.enable_retries", 1),  # already the default in recent versions
    ("grpc.keepalive_time_ms", 30_000),
    ("grpc.keepalive_timeout_ms", 10_000),
    ("grpc.keepalive_permit_without_calls", 1),
])

# Server side
server = grpc.server(executor, options=[
    ("grpc.keepalive_permit_without_calls", 1),
    ("grpc.http2.min_ping_interval_without_data_ms", 20_000),
])`,
    },
    {
      id: 'csharp',
      lang: 'csharp',
      code: `using Grpc.Core;
using Grpc.Net.Client;
using Grpc.Net.Client.Configuration;

var retry = new MethodConfig
{
    Names = { new MethodName { Service = "shop.v1.OrderService", Method = "GetOrder" } },
    RetryPolicy = new RetryPolicy
    {
        MaxAttempts = 4,
        InitialBackoff = TimeSpan.FromSeconds(0.5),
        MaxBackoff = TimeSpan.FromSeconds(5),
        BackoffMultiplier = 2,
        RetryableStatusCodes = { StatusCode.Unavailable },
    },
};

var channel = GrpcChannel.ForAddress("https://orders.internal:5001", new GrpcChannelOptions
{
    ServiceConfig = new ServiceConfig { MethodConfigs = { retry } },
    HttpHandler = new SocketsHttpHandler
    {
        KeepAlivePingDelay = TimeSpan.FromSeconds(30),
        KeepAlivePingTimeout = TimeSpan.FromSeconds(10),
        KeepAlivePingPolicy = HttpKeepAlivePingPolicy.Always,
        EnableMultipleHttp2Connections = true,
    },
});`,
    },
  ],
};

export default topic;
