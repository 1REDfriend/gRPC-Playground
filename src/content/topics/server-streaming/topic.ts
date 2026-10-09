import type { SimEvent, TopicModule } from '../../../lib/types';
import { CLIENT, RESPONSE_HEADERS, SERVER, grpcFrame, l, requestHeaders, trailers } from '../../shared';
import { stringField, varintField } from '../../../lib/protobuf';

const STATUSES = [
  { name: 'ORDER_STATUS_PENDING', value: 1, note: 'payment received' },
  { name: 'ORDER_STATUS_PAID', value: 2, note: 'packing' },
  { name: 'ORDER_STATUS_SHIPPED', value: 3, note: 'with courier' },
  { name: 'ORDER_STATUS_SHIPPED', value: 3, note: 'out for delivery' },
  { name: 'ORDER_STATUS_DELIVERED', value: 4, note: 'signed by customer' },
  { name: 'ORDER_STATUS_DELIVERED', value: 4, note: 'review requested' },
];

const topic: TopicModule = {
  slug: 'server-streaming',
  sim: {
    controls: [
      {
        kind: 'range',
        id: 'updates',
        label: l('จำนวน event ที่ server ส่ง', 'Events the server sends'),
        min: 1,
        max: 6,
        step: 1,
        default: 4,
      },
    ],
    build: (p) => {
      const n = Number(p.updates);
      const events: SimEvent[] = [
        {
          at: 0,
          from: 'client',
          to: 'server',
          kind: 'headers',
          label: 'HEADERS WatchOrder',
          detail: requestHeaders('WatchOrder'),
          note: l('เปิด stream แล้วบอกว่าจะเรียก WatchOrder', 'Opens a stream for WatchOrder.'),
        },
        {
          at: 250,
          from: 'client',
          to: 'server',
          kind: 'data',
          label: 'DATA WatchOrderRequest (END_STREAM)',
          detail: grpcFrame(stringField('order_id', 1, 'A-1001'), 'WatchOrderRequest{order_id:"A-1001"}') + '\n\nflags: END_STREAM  (client is done sending)',
          note: l('request มีก้อนเดียว client ปิดฝั่งส่งของตัวเองเลย', 'One request only, so the client half-closes right away.'),
        },
        {
          at: 1000,
          from: 'server',
          to: 'client',
          kind: 'headers',
          label: 'HEADERS :status 200',
          detail: RESPONSE_HEADERS,
          note: l('server รับเรื่องแล้ว แต่ยังไม่ปิด stream', 'Server accepts. The stream stays open.'),
        },
      ];
      for (let i = 0; i < n; i++) {
        const s = STATUSES[i];
        events.push({
          at: 1300 + i * 900,
          from: 'server',
          to: 'client',
          kind: 'data',
          label: `DATA OrderEvent ${s.name.replace('ORDER_STATUS_', '')}`,
          detail: grpcFrame([...varintField('status', 1, s.value), ...stringField('note', 2, s.note)], `OrderEvent{status:${s.name}, note:"${s.note}"}`),
          note:
            i === 0
              ? l('event แรกมาถึง client ประมวลผลได้ทันที ไม่ต้องรอตัวที่เหลือ', 'First event arrives. The client handles it now, without waiting for the rest.')
              : l(`event ที่ ${i + 1} ส่งมาตอนสถานะเปลี่ยน`, `Event ${i + 1}, sent when the status changes.`),
        });
      }
      events.push({
        at: 1300 + n * 900,
        from: 'server',
        to: 'client',
        kind: 'trailers',
        label: 'TRAILERS grpc-status 0',
        detail: trailers(0),
        note: l('server ส่งครบแล้ว ปิด stream', 'Server is done and closes the stream.'),
      });
      events.push({
        at: 1300 + n * 900 + 700,
        from: 'client',
        to: 'client',
        kind: 'note',
        label: 'for-loop ends (io.EOF / end event)',
        note: l('loop ฝั่ง client จบเองเมื่อเจอ trailers', 'The client loop ends when trailers arrive.'),
      });
      return {
        actors: [CLIENT, SERVER],
        events,
        outcome: { ok: true, text: l(`1 request → ${n} responses`, `1 request → ${n} responses`) },
      };
    },
  },
  code: [
    {
      id: 'proto',
      lang: 'proto',
      code: `service OrderService {
  rpc WatchOrder(WatchOrderRequest) returns (stream OrderEvent);
}

message WatchOrderRequest { string order_id = 1; }
message OrderEvent { OrderStatus status = 1; string note = 2; }`,
    },
    {
      id: 'go',
      lang: 'go',
      code: `// Server
func (s *orderServer) WatchOrder(req *shopv1.WatchOrderRequest, stream shopv1.OrderService_WatchOrderServer) error {
	updates := s.tracker.Subscribe(req.GetOrderId())
	defer s.tracker.Unsubscribe(updates)

	for {
		select {
		case <-stream.Context().Done(): // client went away or deadline hit
			return stream.Context().Err()
		case ev, ok := <-updates:
			if !ok {
				return nil // returning nil sends TRAILERS with grpc-status 0
			}
			if err := stream.Send(&shopv1.OrderEvent{Status: ev.Status, Note: ev.Note}); err != nil {
				return err
			}
		}
	}
}

// Client
stream, err := client.WatchOrder(ctx, &shopv1.WatchOrderRequest{OrderId: "A-1001"})
if err != nil {
	log.Fatal(err)
}
for {
	ev, err := stream.Recv()
	if err == io.EOF {
		break // server closed the stream cleanly
	}
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("%s: %s", ev.GetStatus(), ev.GetNote())
}`,
    },
    {
      id: 'node',
      lang: 'typescript',
      code: `// Server
server.addService(shop.OrderService.service, {
  watchOrder(call: grpc.ServerWritableStream<any, any>) {
    const { orderId } = call.request;
    const unsubscribe = tracker.subscribe(orderId, (ev) => {
      call.write({ status: ev.status, note: ev.note });
      if (ev.status === 'ORDER_STATUS_DELIVERED') call.end(); // sends grpc-status 0
    });
    call.on('cancelled', unsubscribe);
    call.on('close', unsubscribe);
  },
});

// Client
const call = client.watchOrder({ orderId: 'A-1001' });
call.on('data', (ev: any) => console.log(\`\${ev.status}: \${ev.note}\`));
call.on('end', () => console.log('stream finished'));
call.on('error', (err: grpc.ServiceError) => console.error(err.code, err.details));`,
    },
    {
      id: 'python',
      lang: 'python',
      code: `# Server: a generator. Each yield becomes one DATA frame.
class OrderService(shop_pb2_grpc.OrderServiceServicer):
    def WatchOrder(self, request, context):
        for ev in tracker.follow(request.order_id):
            if not context.is_active():   # client cancelled
                return
            yield shop_pb2.OrderEvent(status=ev.status, note=ev.note)
        # falling off the end sends grpc-status 0


# Client: the call returns an iterator
for ev in stub.WatchOrder(shop_pb2.WatchOrderRequest(order_id="A-1001")):
    print(shop_pb2.OrderStatus.Name(ev.status), ev.note)`,
    },
    {
      id: 'csharp',
      lang: 'csharp',
      code: `// Server
public override async Task WatchOrder(
    WatchOrderRequest request,
    IServerStreamWriter<OrderEvent> responseStream,
    ServerCallContext context)
{
    await foreach (var ev in _tracker.FollowAsync(request.OrderId, context.CancellationToken))
    {
        await responseStream.WriteAsync(new OrderEvent { Status = ev.Status, Note = ev.Note });
    }
    // returning from the method sends grpc-status 0
}

// Client
using Grpc.Core;

using var call = client.WatchOrder(new WatchOrderRequest { OrderId = "A-1001" });
await foreach (var ev in call.ResponseStream.ReadAllAsync())
{
    Console.WriteLine($"{ev.Status}: {ev.Note}");
}`,
    },
  ],
};

export default topic;
