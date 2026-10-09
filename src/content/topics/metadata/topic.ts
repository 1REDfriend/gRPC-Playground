import type { TopicModule } from '../../../lib/types';
import { CLIENT, SERVER, grpcFrame, l, req, requestHeaders, trailers } from '../../shared';

const topic: TopicModule = {
  slug: 'metadata',
  sim: {
    build: () => ({
      actors: [CLIENT, SERVER],
      events: [
        {
          at: 0,
          from: 'client',
          to: 'server',
          kind: 'headers',
          label: 'HEADERS + authorization, x-request-id',
          detail: requestHeaders('GetOrder', [
            'grpc-timeout = 2S',
            'authorization = Bearer eyJhbGciOi...',
            'x-request-id = 7f3c9a',
            'x-client-version = ios-5.2.0',
            'x-trace-bin = AAECAwQFBgc=   (binary, base64)',
          ]),
          note: l('metadata ของ request ไปกับ HEADERS frame ก่อน message', 'Request metadata travels in the HEADERS frame, before the message.'),
        },
        {
          at: 250,
          from: 'client',
          to: 'server',
          kind: 'data',
          label: 'DATA GetOrderRequest',
          detail: grpcFrame(req.getOrder(), 'GetOrderRequest{order_id:"A-1001"}'),
        },
        {
          at: 900,
          from: 'server',
          to: 'server',
          kind: 'note',
          label: 'md.get("authorization") → user C-42',
          note: l('handler อ่าน metadata เพื่อรู้ว่าใครเรียก', 'The handler reads metadata to learn who is calling.'),
        },
        {
          at: 1300,
          from: 'server',
          to: 'client',
          kind: 'headers',
          label: 'HEADERS :status 200 + x-served-by',
          detail: ':status = 200\ncontent-type = application/grpc\nx-served-by = orders-7d9f-pod-2',
          note: l('header metadata ของ response ส่งก่อน message', 'Response header metadata, sent before the message.'),
        },
        {
          at: 1550,
          from: 'server',
          to: 'client',
          kind: 'data',
          label: 'DATA Order',
          detail: grpcFrame(req.order(), 'Order{id:"A-1001", ...}'),
        },
        {
          at: 1800,
          from: 'server',
          to: 'client',
          kind: 'trailers',
          label: 'TRAILERS grpc-status 0 + x-db-time-ms',
          detail: trailers(0, '', ['x-db-time-ms = 12', 'x-rate-limit-remaining = 97']),
          note: l('trailer metadata ส่งตอนจบ เหมาะกับค่าที่รู้หลังทำงานเสร็จ', 'Trailer metadata comes last: good for values you only know after the work is done.'),
        },
      ],
      outcome: { ok: true, text: l('metadata ไปกับ HEADERS และ TRAILERS ไม่ได้อยู่ใน message', 'Metadata rides in HEADERS and TRAILERS, never inside the message.') },
    }),
  },
  code: [
    {
      id: 'go',
      lang: 'go',
      code: `import "google.golang.org/grpc/metadata"

// ---- Client: attach metadata, read header + trailer back
ctx = metadata.AppendToOutgoingContext(ctx,
	"authorization", "Bearer "+token,
	"x-request-id", reqID,
)
var header, trailer metadata.MD
order, err := client.GetOrder(ctx, req, grpc.Header(&header), grpc.Trailer(&trailer))
log.Println(header.Get("x-served-by"), trailer.Get("x-db-time-ms"))

// ---- Server: read incoming metadata, send header + trailer
func (s *orderServer) GetOrder(ctx context.Context, req *shopv1.GetOrderRequest) (*shopv1.Order, error) {
	md, _ := metadata.FromIncomingContext(ctx)
	auth := md.Get("authorization") // []string, keys are always lowercase

	grpc.SetHeader(ctx, metadata.Pairs("x-served-by", hostname))
	start := time.Now()
	order, err := s.repo.Find(ctx, req.GetOrderId(), auth)
	grpc.SetTrailer(ctx, metadata.Pairs("x-db-time-ms", strconv.FormatInt(time.Since(start).Milliseconds(), 10)))
	return order, err
}`,
    },
    {
      id: 'node',
      lang: 'typescript',
      code: `// ---- Client
const md = new grpc.Metadata();
md.set('authorization', \`Bearer \${token}\`);
md.set('x-request-id', reqId);

const call = client.getOrder({ orderId: 'A-1001' }, md, (err: any, order: any) => {
  /* ... */
});
call.on('metadata', (header: grpc.Metadata) => console.log(header.get('x-served-by')));
call.on('status', (status: grpc.StatusObject) => console.log(status.metadata.get('x-db-time-ms')));

// ---- Server
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
});`,
    },
    {
      id: 'python',
      lang: 'python',
      code: `# ---- Client: with_call returns the response plus a call object
order, call = stub.GetOrder.with_call(
    shop_pb2.GetOrderRequest(order_id="A-1001"),
    metadata=(("authorization", f"Bearer {token}"), ("x-request-id", req_id)),
)
print(dict(call.initial_metadata()).get("x-served-by"))
print(dict(call.trailing_metadata()).get("x-db-time-ms"))


# ---- Server
class OrderService(shop_pb2_grpc.OrderServiceServicer):
    def GetOrder(self, request, context):
        md = dict(context.invocation_metadata())
        auth = md.get("authorization")

        context.send_initial_metadata((("x-served-by", HOSTNAME),))
        order = repo.find(request.order_id, auth)
        context.set_trailing_metadata((("x-db-time-ms", "12"),))
        return order`,
    },
    {
      id: 'csharp',
      lang: 'csharp',
      code: `// ---- Client
var headers = new Metadata
{
    { "authorization", $"Bearer {token}" },
    { "x-request-id", reqId },
};
using var call = client.GetOrderAsync(new GetOrderRequest { OrderId = "A-1001" }, headers);

var responseHeaders = await call.ResponseHeadersAsync;
var order = await call.ResponseAsync;
var trailers = call.GetTrailers();
Console.WriteLine(responseHeaders.GetValue("x-served-by"));
Console.WriteLine(trailers.GetValue("x-db-time-ms"));

// ---- Server
public override async Task<Order> GetOrder(GetOrderRequest request, ServerCallContext context)
{
    var auth = context.RequestHeaders.GetValue("authorization");

    await context.WriteResponseHeadersAsync(new Metadata { { "x-served-by", Environment.MachineName } });
    var order = await _repo.FindAsync(request.OrderId, auth);
    context.ResponseTrailers.Add("x-db-time-ms", "12");
    return order;
}`,
    },
  ],
};

export default topic;
