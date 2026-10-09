import type { SimEvent, TopicModule } from '../../../lib/types';
import { CLIENT, RESPONSE_HEADERS, SERVER, grpcFrame, l, req, requestHeaders, trailers } from '../../shared';

const TRAVEL = 650;

const topic: TopicModule = {
  slug: 'deadlines',
  sim: {
    controls: [
      {
        kind: 'select',
        id: 'mode',
        label: l('สถานการณ์', 'Scenario'),
        default: 'deadline',
        options: [
          { value: 'deadline', label: l('ตั้ง deadline', 'Deadline') },
          { value: 'cancel', label: l('ผู้ใช้กดยกเลิก', 'User cancels') },
        ],
      },
      { kind: 'range', id: 'deadline', label: l('deadline ของ client', 'Client deadline'), min: 500, max: 4000, step: 100, default: 1500, unit: ' ms' },
      { kind: 'range', id: 'latency', label: l('เวลาที่ server ใช้ทำงาน', 'Server work time'), min: 200, max: 4000, step: 100, default: 2500, unit: ' ms' },
    ],
    build: (p) => {
      const deadline = Number(p.deadline);
      const latency = Number(p.latency);
      const cancel = p.mode === 'cancel';
      const timeoutHeader = cancel ? [] : [`grpc-timeout = ${deadline}m`];
      const events: SimEvent[] = [
        {
          at: 0,
          from: 'client',
          to: 'server',
          kind: 'headers',
          label: cancel ? 'HEADERS GetOrder' : `HEADERS grpc-timeout ${deadline}m`,
          detail: requestHeaders('GetOrder', timeoutHeader),
          note: cancel
            ? l('เรียกแบบไม่มี deadline ผู้ใช้กดยกเลิกเองได้', 'No deadline this time; the user may cancel.')
            : l('deadline ถูกส่งไปกับ header ชื่อ grpc-timeout', 'The deadline travels in the grpc-timeout header.'),
        },
        { at: 200, from: 'client', to: 'server', kind: 'data', label: 'DATA GetOrderRequest', detail: grpcFrame(req.getOrder(), 'GetOrderRequest') },
        {
          at: TRAVEL + 200,
          from: 'server',
          to: 'server',
          kind: 'note',
          label: cancel ? `start work (${latency} ms)` : `start work (${latency} ms), ctx deadline ≈ ${deadline - TRAVEL - 200} ms left`,
          note: cancel ? undefined : l('server รู้ว่าเหลือเวลาเท่าไร ส่งต่อให้ service ถัดไปได้', 'The server knows how much time is left and can pass it downstream.'),
        },
      ];

      const workDone = TRAVEL + 200 + latency;
      const replyArrives = workDone + 500 + TRAVEL;
      const stopAt = cancel ? Math.min(Math.round(latency / 2) + TRAVEL + 200, workDone - 100) : deadline;
      const fails = cancel || replyArrives > deadline;

      if (!fails) {
        events.push(
          { at: workDone, from: 'server', to: 'client', kind: 'headers', label: 'HEADERS :status 200', detail: RESPONSE_HEADERS },
          { at: workDone + 250, from: 'server', to: 'client', kind: 'data', label: 'DATA Order', detail: grpcFrame(req.order(), 'Order') },
          {
            at: workDone + 500,
            from: 'server',
            to: 'client',
            kind: 'trailers',
            label: 'TRAILERS grpc-status 0',
            detail: trailers(0),
            note: l(`ตอบทันก่อน deadline (${deadline} ms)`, `Answered before the ${deadline} ms deadline.`),
          },
        );
        return {
          actors: [CLIENT, SERVER],
          events,
          outcome: { ok: true, text: l('OK: ทันเวลา', 'OK: in time') },
        };
      }

      const code = cancel ? 'CANCELLED' : 'DEADLINE_EXCEEDED';
      const num = cancel ? 1 : 4;
      events.push(
        {
          at: stopAt,
          from: 'client',
          to: 'client',
          kind: 'note',
          label: cancel ? 'user taps "Cancel" → call.cancel()' : `deadline ${deadline} ms reached`,
          note: cancel
            ? l('ผู้ใช้ไม่รอแล้ว client ยกเลิก call', 'The user gave up, so the client cancels the call.')
            : l('client เลิกรอทันทีโดยไม่ต้องรอ server', 'The client stops waiting right away, without asking the server.'),
        },
        {
          at: stopAt + 50,
          from: 'client',
          to: 'client',
          kind: 'error',
          label: `status ${code} (${num})`,
          detail: `grpc-status = ${num}  (${code})\n\nGenerated locally by the client library.`,
          note: l('โค้ดฝั่ง client ได้ error กลับไปจัดการต่อ', 'Client code gets an error to handle.'),
        },
        {
          at: stopAt + 100,
          from: 'client',
          to: 'server',
          kind: 'error',
          label: 'RST_STREAM (CANCEL)',
          detail: 'RST_STREAM frame\nerror code = 0x8 (CANCEL)',
          note: l('บอก server ให้หยุด เพราะไม่มีใครรอผลแล้ว', 'Tells the server to stop: nobody is waiting for the result.'),
        },
      );
      const sees = stopAt + 100 + TRAVEL;
      if (sees < workDone) {
        events.push({
          at: sees,
          from: 'server',
          to: 'server',
          kind: 'note',
          label: 'ctx.Done() → stop DB query',
          note: l('server ที่เขียนดีจะหยุดทำงานที่ไร้ประโยชน์ตรงนี้', 'A well-written server stops the wasted work here.'),
        });
      } else {
        events.push({
          at: workDone,
          from: 'server',
          to: 'client',
          kind: 'trailers',
          label: 'Order + grpc-status 0 (too late)',
          detail: 'The server finished just after the client gave up.\nThe client library drops this reply.',
          note: l('server ทำเสร็จทันพอดี แต่ client เลิกรอไปแล้ว ผลนี้ถูกทิ้ง', 'The server finished, but the client already gave up. This reply is dropped.'),
        });
      }
      return {
        actors: [CLIENT, SERVER],
        events,
        outcome: { ok: false, text: l(`${code}: client ไม่ได้ผลลัพธ์`, `${code}: the client gets no result`) },
      };
    },
  },
  code: [
    {
      id: 'go',
      lang: 'go',
      code: `// ---- Client: every call gets a deadline via the context
ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
defer cancel() // calling cancel() early also cancels the RPC

order, err := client.GetOrder(ctx, &shopv1.GetOrderRequest{OrderId: "A-1001"})
switch status.Code(err) {
case codes.OK:
	log.Println(order.GetStatus())
case codes.DeadlineExceeded:
	log.Println("too slow, show cached data instead")
case codes.Canceled:
	log.Println("cancelled")
}

// ---- Server: pass ctx down so the deadline reaches the database too
func (s *orderServer) GetOrder(ctx context.Context, req *shopv1.GetOrderRequest) (*shopv1.Order, error) {
	if dl, ok := ctx.Deadline(); ok {
		log.Printf("time left: %v", time.Until(dl))
	}
	row := s.db.QueryRowContext(ctx, "SELECT ... WHERE id = $1", req.GetOrderId())
	// If the client gives up, ctx is cancelled and the query is aborted.
	...
}`,
    },
    {
      id: 'node',
      lang: 'typescript',
      code: `// ---- Client: deadline is an absolute Date or ms timestamp
const call = client.getOrder(
  { orderId: 'A-1001' },
  { deadline: Date.now() + 1500 },
  (err: grpc.ServiceError | null, order: any) => {
    if (err?.code === grpc.status.DEADLINE_EXCEEDED) return showCachedOrder();
    if (err?.code === grpc.status.CANCELLED) return;
    if (err) throw err;
    render(order);
  },
);

cancelButton.onclick = () => call.cancel(); // -> CANCELLED

// ---- Server: stop work when the client goes away
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
});`,
    },
    {
      id: 'python',
      lang: 'python',
      code: `# ---- Client: timeout is in seconds
try:
    order = stub.GetOrder(shop_pb2.GetOrderRequest(order_id="A-1001"), timeout=1.5)
except grpc.RpcError as e:
    if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
        order = cached_order()
    else:
        raise

# Cancelling: use the future form
future = stub.GetOrder.future(shop_pb2.GetOrderRequest(order_id="A-1001"))
future.cancel()  # -> CANCELLED


# ---- Server
class OrderService(shop_pb2_grpc.OrderServiceServicer):
    def GetOrder(self, request, context):
        print("time left:", context.time_remaining())
        context.add_callback(lambda: print("client gone, cleaning up"))
        for chunk in repo.scan(request.order_id):
            if not context.is_active():
                return shop_pb2.Order()  # nobody is listening any more
            ...`,
    },
    {
      id: 'csharp',
      lang: 'csharp',
      code: `// ---- Client
using var cts = new CancellationTokenSource();
cancelButton.Click += (_, _) => cts.Cancel();   // -> StatusCode.Cancelled

try
{
    var order = await client.GetOrderAsync(
        new GetOrderRequest { OrderId = "A-1001" },
        deadline: DateTime.UtcNow.AddMilliseconds(1500),
        cancellationToken: cts.Token);
}
catch (RpcException ex) when (ex.StatusCode == StatusCode.DeadlineExceeded)
{
    ShowCachedOrder();
}

// ---- Server: context.CancellationToken fires on deadline or client cancel
public override async Task<Order> GetOrder(GetOrderRequest request, ServerCallContext context)
{
    Console.WriteLine($"time left: {context.Deadline - DateTime.UtcNow}");
    return await _repo.FindAsync(request.OrderId, context.CancellationToken);
}`,
    },
  ],
};

export default topic;
