import type { L, SimEvent, TopicModule } from '../../../lib/types';
import { CLIENT, SERVER, grpcFrame, l, req, requestHeaders, unaryCall } from '../../shared';

interface Failure {
  code: number;
  name: string;
  message: string;
  why: L;
  client: L;
  details?: string;
}

const FAILURES: Record<string, Failure> = {
  NOT_FOUND: {
    code: 5,
    name: 'NOT_FOUND',
    message: 'order A-9999 not found',
    why: l('ไม่มี order หมายเลขนี้ในระบบ', 'There is no order with that id.'),
    client: l('แสดงข้อความ "ไม่พบคำสั่งซื้อ" ไม่ต้อง retry', 'Show "Order not found". Do not retry.'),
  },
  INVALID_ARGUMENT: {
    code: 3,
    name: 'INVALID_ARGUMENT',
    message: 'order_id must match A-\\d+',
    why: l('ข้อมูลที่ส่งมาผิดรูปแบบ', 'The request itself is malformed.'),
    client: l('แจ้ง field ที่ผิดให้ผู้ใช้แก้ อ่านรายละเอียดจาก details', 'Point the user at the bad field, using the details.'),
    details:
      'grpc-status-details-bin = CAMSGW9yZGVyX2lk...  (base64)\n\n' +
      'decoded google.rpc.Status:\n  code: 3\n  details: [ google.rpc.BadRequest {\n    field_violations: [\n      { field: "order_id", description: "must match A-\\\\d+" }\n    ]\n  } ]',
  },
  PERMISSION_DENIED: {
    code: 7,
    name: 'PERMISSION_DENIED',
    message: 'order belongs to another customer',
    why: l('รู้ว่าเป็นใคร แต่ไม่มีสิทธิ์ดู order นี้', 'We know who you are, but you may not see this order.'),
    client: l('ไม่ต้อง retry แสดงว่าไม่มีสิทธิ์', 'Do not retry. Show an access error.'),
  },
  UNAVAILABLE: {
    code: 14,
    name: 'UNAVAILABLE',
    message: 'database connection refused',
    why: l('ระบบปลายทางล่มชั่วคราว', 'A dependency is temporarily down.'),
    client: l('retry ได้ พร้อม backoff (ดูบท Retry)', 'Retry with backoff (see the Retries chapter).'),
  },
  INTERNAL: {
    code: 13,
    name: 'INTERNAL',
    message: 'unexpected nil pointer',
    why: l('bug ฝั่ง server', 'A bug on the server.'),
    client: l('log ไว้ แจ้งผู้ใช้แบบกลาง ๆ ทีม server ต้องไปแก้', 'Log it and show a generic error. The server team has a bug to fix.'),
  },
};

const topic: TopicModule = {
  slug: 'errors',
  sim: {
    controls: [
      {
        kind: 'select',
        id: 'code',
        label: l('ให้ server ตอบแบบไหน', 'What the server returns'),
        default: 'NOT_FOUND',
        options: [
          { value: 'OK', label: l('OK', 'OK') },
          ...Object.keys(FAILURES).map((k) => ({ value: k, label: l(k, k) })),
        ],
      },
    ],
    build: (p) => {
      if (p.code === 'OK') {
        return {
          actors: [CLIENT, SERVER],
          events: unaryCall({ at: 0 }),
          outcome: { ok: true, text: l('OK (0)', 'OK (0)') },
        };
      }
      const f = FAILURES[String(p.code)];
      const extra = f.details ? '\n' + f.details : '';
      const events: SimEvent[] = [
        { at: 0, from: 'client', to: 'server', kind: 'headers', label: 'HEADERS GetOrder', detail: requestHeaders('GetOrder') },
        {
          at: 250,
          from: 'client',
          to: 'server',
          kind: 'data',
          label: 'DATA GetOrderRequest',
          detail: grpcFrame(req.getOrder(f.name === 'INVALID_ARGUMENT' ? 'oops' : f.name === 'NOT_FOUND' ? 'A-9999' : 'A-1001'), 'GetOrderRequest'),
        },
        {
          at: 950,
          from: 'server',
          to: 'server',
          kind: 'note',
          label: `return status ${f.name}`,
          note: f.why,
        },
        {
          at: 1300,
          from: 'server',
          to: 'client',
          kind: 'error',
          label: `HEADERS (Trailers-Only) grpc-status ${f.code}`,
          detail: `:status = 200\ncontent-type = application/grpc\ngrpc-status = ${f.code}\ngrpc-message = ${encodeURIComponent(f.message)}${extra}\n\nflags: END_STREAM  (no DATA frame at all)`,
          note: l(
            'error ไม่มี message ตอบกลับ server ส่ง HEADERS ที่มีสถานะแล้วปิด stream เลย เรียกว่า Trailers-Only',
            'No response message. The server sends one HEADERS frame carrying the status and closes the stream: "Trailers-Only".',
          ),
        },
        {
          at: 2050,
          from: 'client',
          to: 'client',
          kind: 'note',
          label: `catch ${f.name}`,
          note: f.client,
        },
      ];
      return {
        actors: [CLIENT, SERVER],
        events,
        outcome: { ok: false, text: l(`${f.name} (${f.code}): ${f.message}`, `${f.name} (${f.code}): ${f.message}`) },
      };
    },
  },
  code: [
    {
      id: 'go',
      lang: 'go',
      code: `import (
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// ---- Server
func (s *orderServer) GetOrder(ctx context.Context, req *shopv1.GetOrderRequest) (*shopv1.Order, error) {
	if !validID.MatchString(req.GetOrderId()) {
		st, _ := status.New(codes.InvalidArgument, "invalid order_id").WithDetails(&errdetails.BadRequest{
			FieldViolations: []*errdetails.BadRequest_FieldViolation{
				{Field: "order_id", Description: "must match A-\\\\d+"},
			},
		})
		return nil, st.Err()
	}
	order, err := s.repo.Find(ctx, req.GetOrderId())
	if errors.Is(err, sql.ErrNoRows) {
		return nil, status.Errorf(codes.NotFound, "order %s not found", req.GetOrderId())
	}
	if err != nil {
		return nil, status.Error(codes.Unavailable, "database unavailable")
	}
	return order, nil
}

// ---- Client
order, err := client.GetOrder(ctx, req)
if err != nil {
	st := status.Convert(err)
	switch st.Code() {
	case codes.NotFound:
		showNotFound()
	case codes.InvalidArgument:
		for _, d := range st.Details() {
			if br, ok := d.(*errdetails.BadRequest); ok {
				for _, v := range br.GetFieldViolations() {
					markInvalid(v.GetField(), v.GetDescription())
				}
			}
		}
	default:
		log.Printf("GetOrder: %s: %s", st.Code(), st.Message())
	}
}`,
    },
    {
      id: 'node',
      lang: 'typescript',
      code: `// ---- Server: pass an object with code + details to the callback
server.addService(shop.OrderService.service, {
  async getOrder(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    const { orderId } = call.request;
    if (!/^A-\\d+$/.test(orderId)) {
      return callback({ code: grpc.status.INVALID_ARGUMENT, details: 'order_id must match A-\\\\d+' });
    }
    const order = await repo.find(orderId);
    if (!order) {
      return callback({ code: grpc.status.NOT_FOUND, details: \`order \${orderId} not found\` });
    }
    callback(null, order);
  },
});

// ---- Client
client.getOrder({ orderId }, (err: grpc.ServiceError | null, order: any) => {
  if (!err) return render(order);
  switch (err.code) {
    case grpc.status.NOT_FOUND:
      return showNotFound();
    case grpc.status.UNAVAILABLE:
      return scheduleRetry();
    default:
      console.error(grpc.status[err.code], err.details);
  }
});
// Rich details (google.rpc.Status) arrive in err.metadata.get('grpc-status-details-bin').`,
    },
    {
      id: 'python',
      lang: 'python',
      code: `# pip install grpcio-status googleapis-common-protos
from google.protobuf import any_pb2
from google.rpc import code_pb2, error_details_pb2, status_pb2
from grpc_status import rpc_status


# ---- Server
class OrderService(shop_pb2_grpc.OrderServiceServicer):
    def GetOrder(self, request, context):
        if not VALID_ID.match(request.order_id):
            detail = any_pb2.Any()
            detail.Pack(error_details_pb2.BadRequest(field_violations=[
                error_details_pb2.BadRequest.FieldViolation(
                    field="order_id", description="must match A-\\\\d+"),
            ]))
            context.abort_with_status(rpc_status.to_status(status_pb2.Status(
                code=code_pb2.INVALID_ARGUMENT, message="invalid order_id", details=[detail])))

        order = repo.find(request.order_id)
        if order is None:
            context.abort(grpc.StatusCode.NOT_FOUND, f"order {request.order_id} not found")
        return order


# ---- Client
try:
    order = stub.GetOrder(shop_pb2.GetOrderRequest(order_id="A-9999"), timeout=2)
except grpc.RpcError as e:
    if e.code() == grpc.StatusCode.NOT_FOUND:
        show_not_found()
    else:
        status = rpc_status.from_call(e)   # None if there are no rich details
        print(e.code(), e.details(), status)`,
    },
    {
      id: 'csharp',
      lang: 'csharp',
      code: `// ---- Server: throw RpcException
public override async Task<Order> GetOrder(GetOrderRequest request, ServerCallContext context)
{
    if (!ValidId.IsMatch(request.OrderId))
        throw new RpcException(new Status(StatusCode.InvalidArgument, "order_id must match A-\\\\d+"));

    var order = await _repo.FindAsync(request.OrderId, context.CancellationToken);
    return order ?? throw new RpcException(
        new Status(StatusCode.NotFound, $"order {request.OrderId} not found"));
}
// For google.rpc.Status details, add the Grpc.StatusProto package and use
// new Google.Rpc.Status { ... }.ToRpcException().

// ---- Client
try
{
    var order = await client.GetOrderAsync(new GetOrderRequest { OrderId = "A-9999" });
}
catch (RpcException ex) when (ex.StatusCode == StatusCode.NotFound)
{
    ShowNotFound();
}
catch (RpcException ex)
{
    Console.WriteLine($"{ex.StatusCode}: {ex.Status.Detail}");
}`,
    },
  ],
};

export default topic;
