// Runs the Node.js snippets from the site against real in-process servers.
// Handler and client bodies are copied from the snippets; only stubs and wiring are added.
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import protobuf from 'protobufjs';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { HealthImplementation } from 'grpc-health-check';
import { ReflectionService } from '@grpc/reflection';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const PROTO = 'proto/shop/v1/shop.proto';
const CERTS = '../certs/';

const definition = protoLoader.loadSync(PROTO, {
  keepCase: false, // order_id -> orderId
  longs: Number,
  enums: String,
  defaults: true,
});
const shop = (grpc.loadPackageDefinition(definition) as any).shop.v1;

const results: [string, boolean, string][] = [];
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push([name, true, '']);
  } catch (e: any) {
    results.push([name, false, e?.stack ?? String(e)]);
  }
}
function assert(cond: unknown, msg = 'assertion failed'): asserts cond {
  if (!cond) throw new Error(msg);
}

async function listen(server: grpc.Server, creds = grpc.ServerCredentials.createInsecure()): Promise<number> {
  return new Promise((resolve, reject) =>
    server.bindAsync('127.0.0.1:0', creds, (err, port) => (err ? reject(err) : resolve(port))),
  );
}
const insecureClient = (port: number, options?: object) =>
  new shop.OrderService(`127.0.0.1:${port}`, grpc.credentials.createInsecure(), options);

// ------------------------------------------------------------- protobuf
await check('protobuf: protobufjs encode/decode', async () => {
  const root = await protobuf.load(PROTO);
  const Item = root.lookupType('shop.v1.Item');

  const payload = { sku: 'SKU-1007', quantity: 150 };
  const err = Item.verify(payload);
  if (err) throw new Error(err);

  const bytes = Item.encode(Item.create(payload)).finish(); // Uint8Array
  assert(Buffer.from(bytes).toString('hex') === '0a08534b552d31303037109601', Buffer.from(bytes).toString('hex'));

  const decoded = Item.toObject(Item.decode(bytes));
  assert(decoded.sku === 'SKU-1007' && decoded.quantity === 150, JSON.stringify(decoded));
});

// ------------------------------------------------------------- unary
const unaryImpl = {
  getOrder(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    const { orderId } = call.request;
    if (!orderId) {
      callback({ code: grpc.status.INVALID_ARGUMENT, details: 'order_id is required' });
      return;
    }
    callback(null, { id: orderId, customerId: 'C-42', totalCents: 5970, status: 'ORDER_STATUS_PAID' });
  },
};

await check('unary: getOrder + INVALID_ARGUMENT', async () => {
  const server = new grpc.Server();
  server.addService(shop.OrderService.service, unaryImpl);
  const port = await listen(server);
  const client = new shop.OrderService(`localhost:${port}`, grpc.credentials.createInsecure());

  const line = await new Promise<string>((resolve, reject) =>
    client.getOrder({ orderId: 'A-1001' }, (err: grpc.ServiceError | null, order: any) => {
      if (err) {
        console.error('GetOrder failed:', err.code, err.details);
        reject(err);
        return;
      }
      resolve(`order ${order.id} is ${order.status}`);
    }),
  );
  assert(line === 'order A-1001 is ORDER_STATUS_PAID', line);
  const code = await new Promise((r) => client.getOrder({ orderId: '' }, (err: any) => r(err?.code)));
  assert(code === grpc.status.INVALID_ARGUMENT, String(code));
  client.close();
  server.forceShutdown();
});

// ------------------------------------------------------------- streaming
const tracker = {
  subscribe(_id: string, cb: (ev: { status: string; note: string }) => void) {
    const evs = [
      ['ORDER_STATUS_PENDING', 'payment received'],
      ['ORDER_STATUS_PAID', 'packing'],
      ['ORDER_STATUS_SHIPPED', 'with courier'],
      ['ORDER_STATUS_DELIVERED', 'signed'],
    ];
    const timers = evs.map(([status, note], i) => setTimeout(() => cb({ status, note }), 20 * (i + 1)));
    return () => timers.forEach(clearTimeout);
  },
};
const bot = {
  answer: (text: string) => (text.includes('order') ? ['Checking...', 'Out for delivery'] : ["You're welcome"]),
};

const streamImpl = {
  watchOrder(call: grpc.ServerWritableStream<any, any>) {
    const { orderId } = call.request;
    const unsubscribe = tracker.subscribe(orderId, (ev) => {
      call.write({ status: ev.status, note: ev.note });
      if (ev.status === 'ORDER_STATUS_DELIVERED') call.end(); // sends grpc-status 0
    });
    call.on('cancelled', unsubscribe);
    call.on('close', unsubscribe);
  },
  uploadItems(call: grpc.ServerReadableStream<any, any>, callback: grpc.sendUnaryData<any>) {
    let itemCount = 0;
    let totalCents = 0;
    call.on('data', (item: any) => {
      itemCount++;
      totalCents += item.quantity * item.priceCents;
    });
    call.on('end', () => callback(null, { itemCount, totalCents }));
    call.on('error', (err) => console.error(err));
  },
  supportChat(call: grpc.ServerDuplexStream<any, any>) {
    call.write({ from: 'bot', text: 'Hi! How can I help?' });
    call.on('data', (msg: any) => {
      for (const reply of bot.answer(msg.text)) call.write({ from: 'bot', text: reply });
    });
    call.on('end', () => {
      call.write({ from: 'bot', text: 'Have a nice day!' });
      call.end();
    });
  },
};

await check('server streaming: watchOrder', async () => {
  const server = new grpc.Server();
  server.addService(shop.OrderService.service, streamImpl);
  const client = insecureClient(await listen(server));
  const got: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const call = client.watchOrder({ orderId: 'A-1001' });
    call.on('data', (ev: any) => got.push(`${ev.status}: ${ev.note}`));
    call.on('end', () => resolve());
    call.on('error', (err: grpc.ServiceError) => reject(err));
  });
  assert(got.length === 4 && got[3] === 'ORDER_STATUS_DELIVERED: signed', JSON.stringify(got));
  client.close();
  server.forceShutdown();
});

await check('client streaming: uploadItems', async () => {
  const server = new grpc.Server();
  server.addService(shop.OrderService.service, streamImpl);
  const client = insecureClient(await listen(server));
  const cart = [
    { sku: 'SKU-1', quantity: 2, priceCents: 100 },
    { sku: 'SKU-2', quantity: 1, priceCents: 250 },
  ];
  const summary: any = await new Promise((resolve, reject) => {
    const call = client.uploadItems((err: grpc.ServiceError | null, summary: any) => {
      if (err) return reject(err);
      resolve(summary);
    });
    for (const item of cart) call.write(item);
    call.end(); // half-close
  });
  assert(summary.itemCount === 2 && summary.totalCents === 450, JSON.stringify(summary));
  client.close();
  server.forceShutdown();
});

await check('bidi: supportChat', async () => {
  const server = new grpc.Server();
  server.addService(shop.OrderService.service, streamImpl);
  const client = insecureClient(await listen(server));
  const got: string[] = [];
  await new Promise<void>((resolve) => {
    const chat = client.supportChat();
    chat.on('data', (m: any) => got.push(`${m.from}: ${m.text}`));
    chat.on('end', () => resolve());

    chat.write({ from: 'C-42', text: 'Where is order A-1001?' });
    setTimeout(() => {
      chat.write({ from: 'C-42', text: 'Thanks!' });
      chat.end(); // half-close
    }, 200);
  });
  assert(got.length === 5 && got[4] === 'bot: Have a nice day!', JSON.stringify(got));
  client.close();
  server.forceShutdown();
});

// ------------------------------------------------------------- multiplexing
await check('multiplexing: promisify + Promise.all', async () => {
  const server = new grpc.Server();
  server.addService(shop.OrderService.service, unaryImpl);
  const port = await listen(server);

  const client = new shop.OrderService(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
  const getOrder = promisify(client.getOrder.bind(client));

  const orders = await Promise.all(['A-1001', 'A-1002', 'A-1003'].map((orderId) => getOrder({ orderId })));
  assert(orders.map((o: any) => o.status).join() === 'ORDER_STATUS_PAID,ORDER_STATUS_PAID,ORDER_STATUS_PAID');
  client.close();
  server.forceShutdown();
});

// ------------------------------------------------------------- metadata
await check('metadata: headers + trailers', async () => {
  const hostname = 'pod-2';
  const findOrder = (id: string, auth: grpc.MetadataValue) => ({ id, customerId: String(auth) });
  const server = new grpc.Server();
  server.addService(shop.OrderService.service, {
    getOrder(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      const [auth] = call.metadata.get('authorization');

      const header = new grpc.Metadata();
      header.set('x-served-by', hostname);
      call.sendMetadata(header);

      const trailer = new grpc.Metadata();
      trailer.set('x-db-time-ms', '12');
      callback(null, findOrder(call.request.orderId, auth), trailer);
    },
  });
  const client = insecureClient(await listen(server));
  const token = 't0k';
  const reqId = '7f3c9a';
  const seen: Record<string, unknown> = {};

  await new Promise<void>((resolve) => {
    const md = new grpc.Metadata();
    md.set('authorization', `Bearer ${token}`);
    md.set('x-request-id', reqId);

    const call = client.getOrder({ orderId: 'A-1001' }, md, (err: any, order: any) => {
      seen.order = order;
    });
    call.on('metadata', (header: grpc.Metadata) => (seen.header = header.get('x-served-by')[0]));
    call.on('status', (status: grpc.StatusObject) => {
      seen.trailer = status.metadata.get('x-db-time-ms')[0];
      resolve();
    });
  });
  assert(seen.header === 'pod-2' && seen.trailer === '12', JSON.stringify(seen));
  assert((seen.order as any).customerId === 'Bearer t0k', JSON.stringify(seen));
  client.close();
  server.forceShutdown();
});

// ------------------------------------------------------------- deadlines
await check('deadlines: DEADLINE_EXCEEDED + cancel', async () => {
  let aborted = 0;
  const db = {
    findOrder: (id: string, { signal }: { signal: AbortSignal }) =>
      new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve({ id }), 3000);
        signal.addEventListener('abort', () => {
          aborted++;
          clearTimeout(t);
          reject(new Error('aborted'));
        });
      }),
  };
  const server = new grpc.Server();
  server.addService(shop.OrderService.service, {
    async getOrder(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      const abort = new AbortController();
      call.on('cancelled', () => abort.abort()); // fires on deadline or client cancel
      try {
        callback(null, await db.findOrder(call.request.orderId, { signal: abort.signal }));
      } catch (e) {
        if (!call.cancelled) callback({ code: grpc.status.INTERNAL, details: String(e) });
      }
    },
  });
  const client = insecureClient(await listen(server));

  const outcome = await new Promise<string>((resolve, reject) => {
    const showCachedOrder = () => resolve('cached');
    const render = () => resolve('rendered');
    client.getOrder(
      { orderId: 'A-1001' },
      { deadline: Date.now() + 1500 },
      (err: grpc.ServiceError | null, order: any) => {
        if (err?.code === grpc.status.DEADLINE_EXCEEDED) return showCachedOrder();
        if (err?.code === grpc.status.CANCELLED) return;
        if (err) return reject(err);
        render();
      },
    );
  });
  assert(outcome === 'cached', outcome);

  const code = await new Promise((resolve) => {
    const call = client.getOrder({ orderId: 'A-1001' }, (err: any) => resolve(err?.code));
    setTimeout(() => call.cancel(), 200); // -> CANCELLED
  });
  assert(code === grpc.status.CANCELLED, String(code));
  await new Promise((r) => setTimeout(r, 300));
  assert(aborted === 2, `server aborted ${aborted} times`);
  client.close();
  server.forceShutdown();
});

// ------------------------------------------------------------- errors
await check('errors: INVALID_ARGUMENT / NOT_FOUND', async () => {
  const repo = { find: async (id: string) => (id === 'A-9999' ? null : { id }) };
  const server = new grpc.Server();
  server.addService(shop.OrderService.service, {
    async getOrder(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      const { orderId } = call.request;
      if (!/^A-\d+$/.test(orderId)) {
        return callback({ code: grpc.status.INVALID_ARGUMENT, details: 'order_id must match A-\\d+' });
      }
      const order = await repo.find(orderId);
      if (!order) {
        return callback({ code: grpc.status.NOT_FOUND, details: `order ${orderId} not found` });
      }
      callback(null, order);
    },
  });
  const client = insecureClient(await listen(server));
  const handle = (orderId: string) =>
    new Promise<string>((resolve) => {
      const render = () => resolve('render');
      const showNotFound = () => resolve('notfound');
      const scheduleRetry = () => resolve('retry');
      client.getOrder({ orderId }, (err: grpc.ServiceError | null, order: any) => {
        if (!err) return render();
        switch (err.code) {
          case grpc.status.NOT_FOUND:
            return showNotFound();
          case grpc.status.UNAVAILABLE:
            return scheduleRetry();
          default:
            resolve(`${grpc.status[err.code]} ${err.details}`);
        }
      });
    });
  assert((await handle('A-9999')) === 'notfound');
  const r = await handle('oops');
  assert(r === 'INVALID_ARGUMENT order_id must match A-\\d+', r);
  assert((await handle('A-1')) === 'render');
  client.close();
  server.forceShutdown();
});

// ------------------------------------------------------------- interceptors
await check('interceptors: client token + server logging', async () => {
  const logged: string[] = [];
  const loggingInterceptor: grpc.ServerInterceptor = (methodDescriptor, call) => {
    const start = Date.now();
    return new grpc.ServerInterceptingCall(call, {
      sendStatus(status, next) {
        logged.push(`${methodDescriptor.path} ${grpc.status[status.code]} ${Date.now() - start}ms`);
        next(status);
      },
    });
  };
  const server = new grpc.Server({ interceptors: [loggingInterceptor] });
  server.addService(shop.OrderService.service, {
    getOrder(call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) {
      cb(null, { id: String(call.metadata.get('authorization')[0]) });
    },
  });
  const addr = `127.0.0.1:${await listen(server)}`;
  const getToken = () => 'abc';

  const authInterceptor: grpc.Interceptor = (options, nextCall) =>
    new grpc.InterceptingCall(nextCall(options), {
      start(metadata, listener, next) {
        metadata.set('authorization', `Bearer ${getToken()}`);
        next(metadata, listener);
      },
    });

  const client = new shop.OrderService(addr, grpc.credentials.createInsecure(), {
    interceptors: [authInterceptor],
  });
  const order: any = await promisify(client.getOrder.bind(client))({ orderId: 'A-1' });
  assert(order.id === 'Bearer abc', order.id);
  assert(logged.length === 1 && logged[0].startsWith('/shop.v1.OrderService/GetOrder OK'), JSON.stringify(logged));
  client.close();
  server.forceShutdown();
});

// ------------------------------------------------------------- retries + keepalive
await check('retries: service config retries UNAVAILABLE', async () => {
  let calls = 0;
  const server = new grpc.Server({
    'grpc.keepalive_permit_without_calls': 1,
    'grpc.http2.min_ping_interval_without_data_ms': 20_000,
  });
  server.addService(shop.OrderService.service, {
    getOrder(call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) {
      calls++;
      if (calls <= 2) return cb({ code: grpc.status.UNAVAILABLE, details: 'connection to database lost' });
      cb(null, { id: call.request.orderId });
    },
  });
  const port = await listen(server);
  const creds = grpc.credentials.createInsecure();
  const serviceConfig = {
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

  const client = new shop.OrderService(`127.0.0.1:${port}`, creds, {
    'grpc.service_config': JSON.stringify(serviceConfig),
    'grpc.keepalive_time_ms': 30_000,
    'grpc.keepalive_timeout_ms': 10_000,
    'grpc.keepalive_permit_without_calls': 1,
  });
  const order: any = await promisify(client.getOrder.bind(client))({ orderId: 'A-1' });
  assert(order.id === 'A-1' && calls === 3, `calls=${calls}`);
  client.close();
  server.forceShutdown();
});

// ------------------------------------------------------------- load balancing
await check('load balancing: dns:/// + round_robin', async () => {
  const server = new grpc.Server();
  server.addService(shop.OrderService.service, unaryImpl);
  const port = await listen(server);
  const creds = grpc.credentials.createInsecure();
  const client = new shop.OrderService(`dns:///localhost:${port}`, creds, {
    'grpc.service_config': JSON.stringify({
      loadBalancingConfig: [{ round_robin: {} }],
    }),
  });
  const order: any = await promisify(client.getOrder.bind(client))({ orderId: 'A-1' });
  assert(order.id === 'A-1');
  client.close();
  server.forceShutdown();
});

// ------------------------------------------------------------- health + reflection
await check('health + reflection', async () => {
  const server = new grpc.Server();
  server.addService(shop.OrderService.service, unaryImpl);

  const health = new HealthImplementation({ 'shop.v1.OrderService': 'SERVING' });
  health.addToServer(server);
  new ReflectionService(definition).addToServer(server); // same packageDefinition you loaded

  const port = await listen(server);
  const healthDef = protoLoader.loadSync(
    require.resolve('grpc-health-check/proto/health/v1/health.proto'),
    { keepCase: true, enums: String },
  );
  const Health = (grpc.loadPackageDefinition(healthDef) as any).grpc.health.v1.Health;
  const h = new Health(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
  const check1: any = await promisify(h.Check.bind(h))({ service: 'shop.v1.OrderService' });
  assert(check1.status === 'SERVING', JSON.stringify(check1));
  health.setStatus('shop.v1.OrderService', 'NOT_SERVING');
  const check2: any = await promisify(h.Check.bind(h))({ service: 'shop.v1.OrderService' });
  assert(check2.status === 'NOT_SERVING', JSON.stringify(check2));
  h.close();
  server.forceShutdown();
});

// ------------------------------------------------------------- TLS
await check('tls: mTLS + token on top', async () => {
  const ca = readFileSync(CERTS + 'ca.crt');
  const server = new grpc.Server();
  let seenAuth = '';
  let peerCN = '';
  server.addService(shop.OrderService.service, {
    getOrder(call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) {
      seenAuth = String(call.metadata.get('authorization')[0]);
      peerCN = String((call.getAuthContext() as any)?.sslPeerCertificate?.subject?.CN);
      cb(null, { id: call.request.orderId });
    },
  });
  const serverCreds = grpc.ServerCredentials.createSsl(
    ca,
    [{ private_key: readFileSync(CERTS + 'orders.key'), cert_chain: readFileSync(CERTS + 'orders.crt') }],
    true, // checkClientCertificate; false for plain TLS
  );
  const port = await listen(server, serverCreds);

  const clientCreds = grpc.credentials.createSsl(
    ca,
    readFileSync(CERTS + 'checkout.key'), // omit key + cert for plain TLS
    readFileSync(CERTS + 'checkout.crt'),
  );
  const getToken = () => 'xyz';
  const withToken = grpc.credentials.combineChannelCredentials(
    clientCreds,
    grpc.credentials.createFromMetadataGenerator((_params, cb) => {
      const md = new grpc.Metadata();
      md.set('authorization', `Bearer ${getToken()}`);
      cb(null, md);
    }),
  );
  const client = new shop.OrderService(`localhost:${port}`, withToken, {
    'grpc.ssl_target_name_override': 'orders.internal',
  });
  const order: any = await promisify(client.getOrder.bind(client))({ orderId: 'A-1' });
  assert(order.id === 'A-1' && seenAuth === 'Bearer xyz', seenAuth);
  console.log('  peer CN seen by server:', peerCN);
  client.close();

  const noCert = new shop.OrderService(`localhost:${port}`, grpc.credentials.createSsl(ca), {
    'grpc.ssl_target_name_override': 'orders.internal',
  });
  const code = await new Promise((r) =>
    noCert.getOrder({ orderId: 'A-1' }, { deadline: Date.now() + 3000 }, (err: any) => r(err?.code)),
  );
  assert(code === grpc.status.UNAVAILABLE, `no-cert call returned ${code}`);
  noCert.close();
  server.forceShutdown();
});

console.log();
for (const [name, ok, detail] of results) {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`);
  if (detail) console.log('       ' + detail.split('\n').slice(0, 6).join('\n       '));
}
const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
