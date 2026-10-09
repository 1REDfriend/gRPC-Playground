import type { TopicModule } from '../../../lib/types';
import { CLIENT, SERVER, l, unaryCall } from '../../shared';

const topic: TopicModule = {
  slug: 'unary',
  sim: {
    build: () => ({
      actors: [CLIENT, SERVER],
      events: [
        {
          at: 0,
          from: 'client',
          to: 'client',
          kind: 'note',
          label: 'client.GetOrder({order_id: "A-1001"})',
          note: l('โค้ดฝั่ง client เรียก method เหมือนฟังก์ชันธรรมดา', 'Client code calls the method like a normal function.'),
        },
        ...unaryCall({
          at: 350,
          notes: {
            headers: l('เปิด stream ใหม่ บอก server ว่าจะเรียก method ไหน', 'Opens a new stream and names the method to call.'),
            data: l('request ที่แปลงเป็น Protobuf แล้ว มีหัว 5 bytes นำหน้า', 'The Protobuf-encoded request, behind a 5-byte prefix.'),
            respHeaders: l('server ตอบรับ ส่ง metadata ชุดแรกกลับมา', 'Server accepts and sends its initial metadata.'),
            respData: l('response message ตัวเดียวของการเรียกนี้', 'The single response message.'),
            trailers: l('ปิด stream พร้อมสถานะ 0 แปลว่า OK', 'Closes the stream with status 0, meaning OK.'),
          },
        }),
        {
          at: 600,
          from: 'server',
          to: 'server',
          kind: 'note',
          label: 'GetOrder(ctx, req) → load from DB',
          note: l('handler ของคุณทำงานตรงนี้', 'Your handler runs here.'),
        },
        {
          at: 2350,
          from: 'client',
          to: 'client',
          kind: 'note',
          label: 'order.status == ORDER_STATUS_PAID',
          note: l('client ได้ object ที่มี type ครบ ไม่ต้อง parse JSON เอง', 'The client gets a typed object back. No JSON parsing.'),
        },
      ],
      outcome: { ok: true, text: l('เสร็จหนึ่งรอบ: 1 request → 1 response', 'Done: 1 request → 1 response') },
    }),
  },
  code: [
    {
      id: 'proto',
      lang: 'proto',
      code: `service OrderService {
  rpc GetOrder(GetOrderRequest) returns (Order);
}

message GetOrderRequest { string order_id = 1; }

message Order {
  string id = 1;
  string customer_id = 2;
  repeated Item items = 3;
  int64 total_cents = 4;
  OrderStatus status = 5;
}`,
    },
    {
      id: 'go',
      lang: 'go',
      code: `// server/main.go
package main

import (
	"context"
	"log"
	"net"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	shopv1 "example.com/shop/gen/shop/v1"
)

type orderServer struct {
	shopv1.UnimplementedOrderServiceServer
}

func (s *orderServer) GetOrder(ctx context.Context, req *shopv1.GetOrderRequest) (*shopv1.Order, error) {
	if req.GetOrderId() == "" {
		return nil, status.Error(codes.InvalidArgument, "order_id is required")
	}
	return &shopv1.Order{
		Id:         req.GetOrderId(),
		CustomerId: "C-42",
		TotalCents: 5970,
		Status:     shopv1.OrderStatus_ORDER_STATUS_PAID,
	}, nil
}

func main() {
	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatal(err)
	}
	s := grpc.NewServer()
	shopv1.RegisterOrderServiceServer(s, &orderServer{})
	log.Println("listening on :50051")
	log.Fatal(s.Serve(lis))
}

// client/main.go
// imports: context, log, time, google.golang.org/grpc,
// google.golang.org/grpc/credentials/insecure, shopv1
func main() {
	conn, err := grpc.NewClient("localhost:50051",
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()

	client := shopv1.NewOrderServiceClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	order, err := client.GetOrder(ctx, &shopv1.GetOrderRequest{OrderId: "A-1001"})
	if err != nil {
		log.Fatalf("GetOrder failed: %v", err)
	}
	log.Printf("order %s is %s", order.GetId(), order.GetStatus())
}`,
    },
    {
      id: 'node',
      lang: 'typescript',
      code: `// server.ts
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const definition = protoLoader.loadSync('shop.proto', {
  keepCase: false, // order_id -> orderId
  longs: Number,
  enums: String,
  defaults: true,
});
const shop = (grpc.loadPackageDefinition(definition) as any).shop.v1;

const server = new grpc.Server();
server.addService(shop.OrderService.service, {
  getOrder(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    const { orderId } = call.request;
    if (!orderId) {
      callback({ code: grpc.status.INVALID_ARGUMENT, details: 'order_id is required' });
      return;
    }
    callback(null, { id: orderId, customerId: 'C-42', totalCents: 5970, status: 'ORDER_STATUS_PAID' });
  },
});

server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) throw err;
  console.log(\`listening on :\${port}\`);
});

// client.ts
const client = new shop.OrderService('localhost:50051', grpc.credentials.createInsecure());

client.getOrder({ orderId: 'A-1001' }, (err: grpc.ServiceError | null, order: any) => {
  if (err) {
    console.error('GetOrder failed:', err.code, err.details);
    return;
  }
  console.log(\`order \${order.id} is \${order.status}\`);
});`,
    },
    {
      id: 'python',
      lang: 'python',
      code: `# server.py
from concurrent import futures

import grpc
from shop.v1 import shop_pb2, shop_pb2_grpc  # generated into gen/; run with PYTHONPATH=gen


class OrderService(shop_pb2_grpc.OrderServiceServicer):
    def GetOrder(self, request, context):
        if not request.order_id:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "order_id is required")
        return shop_pb2.Order(
            id=request.order_id,
            customer_id="C-42",
            total_cents=5970,
            status=shop_pb2.ORDER_STATUS_PAID,
        )


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    shop_pb2_grpc.add_OrderServiceServicer_to_server(OrderService(), server)
    server.add_insecure_port("[::]:50051")
    server.start()
    print("listening on :50051")
    server.wait_for_termination()


# client.py
def call_get_order():
    with grpc.insecure_channel("localhost:50051") as channel:
        stub = shop_pb2_grpc.OrderServiceStub(channel)
        order = stub.GetOrder(shop_pb2.GetOrderRequest(order_id="A-1001"), timeout=2.0)
        print(f"order {order.id} is {shop_pb2.OrderStatus.Name(order.status)}")`,
    },
    {
      id: 'csharp',
      lang: 'csharp',
      code: `// Server: Services/OrderServiceImpl.cs
using Grpc.Core;
using Shop.V1;

public class OrderServiceImpl : OrderService.OrderServiceBase
{
    public override Task<Order> GetOrder(GetOrderRequest request, ServerCallContext context)
    {
        if (string.IsNullOrEmpty(request.OrderId))
            throw new RpcException(new Status(StatusCode.InvalidArgument, "order_id is required"));

        return Task.FromResult(new Order
        {
            Id = request.OrderId,
            CustomerId = "C-42",
            TotalCents = 5970,
            Status = OrderStatus.Paid,
        });
    }
}

// Server: Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddGrpc();
var app = builder.Build();
app.MapGrpcService<OrderServiceImpl>();
app.Run();

// Client
using Grpc.Net.Client;
using Shop.V1;

using var channel = GrpcChannel.ForAddress("https://localhost:5001");
var client = new OrderService.OrderServiceClient(channel);

var order = await client.GetOrderAsync(
    new GetOrderRequest { OrderId = "A-1001" },
    deadline: DateTime.UtcNow.AddSeconds(2));

Console.WriteLine($"order {order.Id} is {order.Status}");`,
    },
  ],
};

export default topic;
