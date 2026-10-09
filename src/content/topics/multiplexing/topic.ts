import type { SimEvent, TopicModule } from '../../../lib/types';
import { CLIENT, SERVER, l, requestHeaders, trailers } from '../../shared';

const CALLS = [
  { method: 'GetOrder', work: 1500, name: 'GetOrder (slow DB)' },
  { method: 'GetOrder', work: 300, name: 'GetOrder (cached)' },
  { method: 'GetOrder', work: 500, name: 'GetOrder' },
];

function http1(): SimEvent[] {
  const events: SimEvent[] = [];
  let t = 0;
  CALLS.forEach((c, i) => {
    events.push({
      at: t,
      from: 'client',
      to: 'server',
      kind: 'http',
      label: `POST /orders/${i + 1}`,
      detail: `POST /orders/A-100${i + 1} HTTP/1.1\nHost: orders.example.com\nContent-Type: application/json`,
      note: i === 0 ? l('request แรกออกไปก่อน', 'The first request goes out.') : l(`request ${i + 1} ต้องรอตัวก่อนหน้าตอบให้เสร็จ`, `Request ${i + 1} had to wait for the previous response.`),
    });
    events.push({ at: t + 650, from: 'server', to: 'server', kind: 'note', label: `work ${c.work} ms` });
    t += 650 + c.work;
    events.push({
      at: t,
      from: 'server',
      to: 'client',
      kind: 'http',
      label: `200 OK (${i + 1})`,
      detail: `HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"id":"A-100${i + 1}","status":"PAID"}`,
    });
    t += 650;
  });
  events.push({
    at: t,
    from: 'client',
    to: 'client',
    kind: 'note',
    label: `all done at ${t} ms`,
    note: l('ตัวช้าตัวแรกขวางทุกตัวที่ตามมา (head-of-line blocking)', 'The slow first call held up everything behind it (head-of-line blocking).'),
  });
  return events;
}

function http2(): SimEvent[] {
  const events: SimEvent[] = [];
  let finish = 0;
  CALLS.forEach((c, i) => {
    const stream = i * 2 + 1;
    const start = i * 180;
    events.push({
      at: start,
      from: 'client',
      to: 'server',
      kind: 'headers',
      label: `HEADERS+DATA ${c.method}`,
      detail: `stream_id = ${stream}\n` + requestHeaders(c.method),
      stream,
      note: i === 0 ? l('ทุก call ออกไปพร้อมกันบน connection เดียว แยกกันด้วย stream id', 'Every call goes out at once on one connection, separated by stream id.') : undefined,
    });
    events.push({ at: start + 650, from: 'server', to: 'server', kind: 'note', label: `#${stream} work ${c.work} ms`, stream });
    const back = start + 650 + c.work;
    events.push({
      at: back,
      from: 'server',
      to: 'client',
      kind: 'data',
      label: `DATA+TRAILERS ${c.name}`,
      detail: `stream_id = ${stream}\nDATA Order{...}\n` + trailers(0),
      stream,
      note: c.work < 1000 ? l(`stream ${stream} เสร็จก่อน ไม่ต้องรอตัวช้า`, `Stream ${stream} finishes first; it doesn't wait for the slow one.`) : undefined,
    });
    finish = Math.max(finish, back + 650);
  });
  events.push({
    at: finish,
    from: 'client',
    to: 'client',
    kind: 'note',
    label: `all done at ${finish} ms`,
    note: l('เวลารวมเท่ากับ call ที่ช้าที่สุดตัวเดียว', 'Total time is roughly the slowest single call.'),
  });
  return events;
}

const topic: TopicModule = {
  slug: 'multiplexing',
  sim: {
    controls: [
      {
        kind: 'select',
        id: 'proto',
        label: l('protocol', 'Protocol'),
        default: 'h2',
        options: [
          { value: 'h1', label: l('HTTP/1.1 (REST ทั่วไป)', 'HTTP/1.1 (typical REST)') },
          { value: 'h2', label: l('HTTP/2 (gRPC)', 'HTTP/2 (gRPC)') },
        ],
      },
    ],
    build: (p) => {
      const isH2 = p.proto === 'h2';
      const events = isH2 ? http2() : http1();
      const end = events[events.length - 1].at;
      return {
        actors: [CLIENT, SERVER],
        events,
        outcome: {
          ok: isH2,
          text: isH2
            ? l(`3 calls บน 1 connection เสร็จใน ${end} ms`, `3 calls on 1 connection, done in ${end} ms`)
            : l(`3 calls ต่อคิวกัน ใช้เวลา ${end} ms`, `3 calls queued one after another: ${end} ms`),
        },
      };
    },
  },
  code: [
    {
      id: 'go',
      lang: 'go',
      code: `// One ClientConn = one (or a few) HTTP/2 connections. Share it; do NOT dial per request.
conn, err := grpc.NewClient("orders.internal:50051",
	grpc.WithTransportCredentials(insecure.NewCredentials()))
if err != nil {
	log.Fatal(err)
}
defer conn.Close()
client := shopv1.NewOrderServiceClient(conn)

// Fire three calls concurrently. Each gets its own HTTP/2 stream on the same connection.
var wg sync.WaitGroup
for _, id := range []string{"A-1001", "A-1002", "A-1003"} {
	wg.Add(1)
	go func(id string) {
		defer wg.Done()
		order, err := client.GetOrder(ctx, &shopv1.GetOrderRequest{OrderId: id})
		if err != nil {
			log.Printf("%s: %v", id, err)
			return
		}
		log.Printf("%s: %s", id, order.GetStatus())
	}(id)
}
wg.Wait()`,
    },
    {
      id: 'node',
      lang: 'typescript',
      code: `import { promisify } from 'node:util';

// Create the client once at startup and reuse it everywhere.
const client = new shop.OrderService('orders.internal:50051', grpc.credentials.createInsecure());
const getOrder = promisify(client.getOrder.bind(client));

// Three concurrent calls, multiplexed over the same HTTP/2 connection.
const orders = await Promise.all(
  ['A-1001', 'A-1002', 'A-1003'].map((orderId) => getOrder({ orderId })),
);
console.log(orders.map((o: any) => o.status));`,
    },
    {
      id: 'python',
      lang: 'python',
      code: `import asyncio
import grpc
from shop.v1 import shop_pb2, shop_pb2_grpc


async def main():
    # One channel, created once, shared by every call
    async with grpc.aio.insecure_channel("orders.internal:50051") as channel:
        stub = shop_pb2_grpc.OrderServiceStub(channel)
        orders = await asyncio.gather(*[
            stub.GetOrder(shop_pb2.GetOrderRequest(order_id=oid))
            for oid in ("A-1001", "A-1002", "A-1003")
        ])
        print([o.status for o in orders])

asyncio.run(main())`,
    },
    {
      id: 'csharp',
      lang: 'csharp',
      code: `// Create the channel once (e.g. register as a singleton) and reuse it.
var channel = GrpcChannel.ForAddress("https://orders.internal:5001", new GrpcChannelOptions
{
    HttpHandler = new SocketsHttpHandler
    {
        // Open extra connections when one hits the server's concurrent-stream limit (often 100)
        EnableMultipleHttp2Connections = true,
    },
});
var client = new OrderService.OrderServiceClient(channel);

var ids = new[] { "A-1001", "A-1002", "A-1003" };
var orders = await Task.WhenAll(ids.Select(id =>
    client.GetOrderAsync(new GetOrderRequest { OrderId = id }).ResponseAsync));

Console.WriteLine(string.Join(", ", orders.Select(o => o.Status)));`,
    },
  ],
};

export default topic;
