import type { SimEvent, TopicModule } from '../../../lib/types';
import { SERVER, l } from '../../shared';

function health(): SimEvent[] {
  return [
    {
      at: 0,
      from: 'probe',
      to: 'server',
      kind: 'headers',
      label: 'Health/Check {service: "shop.v1.OrderService"}',
      detail: ':path = /grpc.health.v1.Health/Check\n\nHealthCheckRequest{service:"shop.v1.OrderService"}',
      note: l('Kubernetes หรือ load balancer ถามว่าพร้อมรับงานไหม', 'Kubernetes or a load balancer asks whether the service can take traffic.'),
    },
    {
      at: 750,
      from: 'server',
      to: 'probe',
      kind: 'data',
      label: 'SERVING',
      detail: 'HealthCheckResponse{status:SERVING}\ngrpc-status = 0',
    },
    {
      at: 1600,
      from: 'probe',
      to: 'server',
      kind: 'headers',
      label: 'Health/Watch (server stream)',
      detail: ':path = /grpc.health.v1.Health/Watch',
      note: l('Watch เปิด stream ค้างไว้ server แจ้งเองเมื่อสถานะเปลี่ยน', 'Watch keeps a stream open; the server reports changes as they happen.'),
    },
    { at: 2350, from: 'server', to: 'probe', kind: 'data', label: 'SERVING', detail: 'HealthCheckResponse{status:SERVING}' },
    {
      at: 3100,
      from: 'server',
      to: 'server',
      kind: 'error',
      label: 'DB pool exhausted → SetServingStatus(NOT_SERVING)',
      note: l('โค้ดของคุณเปลี่ยนสถานะเมื่อ dependency มีปัญหา', 'Your code flips the status when a dependency is in trouble.'),
    },
    {
      at: 3450,
      from: 'server',
      to: 'probe',
      kind: 'error',
      label: 'NOT_SERVING',
      detail: 'HealthCheckResponse{status:NOT_SERVING}',
      note: l('probe ได้รู้ทันที ไม่ต้องรอรอบถามถัดไป', 'The probe hears about it immediately, no polling interval.'),
    },
    {
      at: 4200,
      from: 'probe',
      to: 'probe',
      kind: 'note',
      label: 'remove pod from rotation',
      note: l('หยุดส่ง traffic มาที่ pod นี้จนกว่าจะกลับมา SERVING', 'No traffic to this pod until it reports SERVING again.'),
    },
  ];
}

function reflection(): SimEvent[] {
  return [
    {
      at: 0,
      from: 'probe',
      to: 'server',
      kind: 'headers',
      label: 'ServerReflectionInfo: list_services',
      detail: ':path = /grpc.reflection.v1.ServerReflection/ServerReflectionInfo\n\nServerReflectionRequest{list_services:""}',
      note: l('grpcurl ไม่มีไฟล์ .proto เลยถาม server ว่ามี service อะไรบ้าง', 'grpcurl has no .proto file, so it asks the server what services exist.'),
    },
    {
      at: 750,
      from: 'server',
      to: 'probe',
      kind: 'data',
      label: '[shop.v1.OrderService, grpc.health.v1.Health, ...]',
      detail: 'ListServiceResponse{\n  service: [\n    {name:"shop.v1.OrderService"},\n    {name:"grpc.health.v1.Health"},\n    {name:"grpc.reflection.v1.ServerReflection"}\n  ]\n}',
    },
    {
      at: 1500,
      from: 'probe',
      to: 'server',
      kind: 'data',
      label: 'file_containing_symbol: shop.v1.OrderService',
      detail: 'ServerReflectionRequest{file_containing_symbol:"shop.v1.OrderService"}',
      note: l('ขอ schema ของ service นี้', 'Asks for the schema of this service.'),
    },
    {
      at: 2250,
      from: 'server',
      to: 'probe',
      kind: 'data',
      label: 'FileDescriptorProto (shop.proto)',
      detail: 'FileDescriptorResponse{\n  file_descriptor_proto: [ <serialized shop.proto, 912 bytes> ]\n}',
      note: l('ได้ schema แบบเดียวกับที่ compile จาก .proto', 'Gets the same schema you would compile from the .proto.'),
    },
    {
      at: 3000,
      from: 'probe',
      to: 'server',
      kind: 'headers',
      label: 'GetOrder (JSON → Protobuf)',
      detail: '$ grpcurl -d \'{"order_id":"A-1001"}\' localhost:50051 shop.v1.OrderService/GetOrder',
      note: l('grpcurl แปลง JSON ที่คุณพิมพ์เป็น Protobuf ให้', 'grpcurl turns the JSON you typed into Protobuf.'),
    },
    {
      at: 3750,
      from: 'server',
      to: 'probe',
      kind: 'trailers',
      label: 'Order → printed as JSON',
      detail: '{\n  "id": "A-1001",\n  "customerId": "C-42",\n  "totalCents": "5970",\n  "status": "ORDER_STATUS_PAID"\n}',
    },
  ];
}

const topic: TopicModule = {
  slug: 'health-reflection',
  sim: {
    controls: [
      {
        kind: 'select',
        id: 'mode',
        label: l('ดูเรื่องไหน', 'Show'),
        default: 'health',
        options: [
          { value: 'health', label: l('Health check', 'Health check') },
          { value: 'reflection', label: l('Reflection + grpcurl', 'Reflection + grpcurl') },
        ],
      },
    ],
    build: (p) => {
      const isHealth = p.mode === 'health';
      return {
        actors: [
          { id: 'probe', label: isHealth ? l('k8s / LB probe', 'k8s / LB probe') : l('grpcurl', 'grpcurl') },
          SERVER,
        ],
        events: isHealth ? health() : reflection(),
        outcome: isHealth
          ? { ok: false, text: l('pod ที่ไม่พร้อมถูกถอดออกอัตโนมัติ', 'The unhealthy pod was taken out automatically.') }
          : { ok: true, text: l('เรียก gRPC ได้โดยไม่ต้องมีไฟล์ .proto', 'Called gRPC without having the .proto file.') },
      };
    },
  },
  code: [
    {
      id: 'go',
      lang: 'go',
      code: `import (
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
)

s := grpc.NewServer()
shopv1.RegisterOrderServiceServer(s, &orderServer{})

hs := health.NewServer()
healthpb.RegisterHealthServer(s, hs)
hs.SetServingStatus("shop.v1.OrderService", healthpb.HealthCheckResponse_SERVING)

reflection.Register(s) // consider enabling only outside production

// Later, when a dependency fails:
hs.SetServingStatus("shop.v1.OrderService", healthpb.HealthCheckResponse_NOT_SERVING)`,
    },
    {
      id: 'node',
      lang: 'typescript',
      code: `// npm install grpc-health-check @grpc/reflection
import { HealthImplementation } from 'grpc-health-check';
import { ReflectionService } from '@grpc/reflection';

const health = new HealthImplementation({ 'shop.v1.OrderService': 'SERVING' });
health.addToServer(server);

new ReflectionService(definition).addToServer(server); // same packageDefinition you loaded

// Later:
health.setStatus('shop.v1.OrderService', 'NOT_SERVING');`,
    },
    {
      id: 'python',
      lang: 'python',
      code: `# pip install grpcio-health-checking grpcio-reflection
from grpc_health.v1 import health, health_pb2, health_pb2_grpc
from grpc_reflection.v1alpha import reflection

health_servicer = health.HealthServicer()
health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)
health_servicer.set("shop.v1.OrderService", health_pb2.HealthCheckResponse.SERVING)

SERVICE_NAMES = (
    shop_pb2.DESCRIPTOR.services_by_name["OrderService"].full_name,
    reflection.SERVICE_NAME,
)
reflection.enable_server_reflection(SERVICE_NAMES, server)

# Later:
health_servicer.set("shop.v1.OrderService", health_pb2.HealthCheckResponse.NOT_SERVING)`,
    },
    {
      id: 'csharp',
      lang: 'csharp',
      code: `// dotnet add package Grpc.AspNetCore.HealthChecks
// dotnet add package Grpc.AspNetCore.Server.Reflection
using Microsoft.Extensions.Diagnostics.HealthChecks;

builder.Services.AddGrpc();
builder.Services.AddGrpcHealthChecks()
    .AddCheck("database", () => db.CanConnect()
        ? HealthCheckResult.Healthy()
        : HealthCheckResult.Unhealthy());
builder.Services.AddGrpcReflection();

var app = builder.Build();
app.MapGrpcService<OrderServiceImpl>();
app.MapGrpcHealthChecksService();
if (app.Environment.IsDevelopment())
{
    app.MapGrpcReflectionService();
}`,
    },
    {
      id: 'shell',
      lang: 'bash',
      label: 'grpcurl',
      code: `# List services (needs reflection on the server)
grpcurl -plaintext localhost:50051 list

# Describe a service or message
grpcurl -plaintext localhost:50051 describe shop.v1.OrderService
grpcurl -plaintext localhost:50051 describe shop.v1.Order

# Call a method with JSON
grpcurl -plaintext -d '{"order_id": "A-1001"}' \\
  localhost:50051 shop.v1.OrderService/GetOrder

# No reflection? Point grpcurl at the .proto instead
grpcurl -plaintext -import-path proto -proto shop/v1/shop.proto \\
  -d '{"order_id": "A-1001"}' localhost:50051 shop.v1.OrderService/GetOrder

# Health check
grpcurl -plaintext -d '{"service": "shop.v1.OrderService"}' \\
  localhost:50051 grpc.health.v1.Health/Check

# Kubernetes (1.24+) can probe gRPC health natively:
#   readinessProbe:
#     grpc:
#       port: 50051
#       service: shop.v1.OrderService`,
    },
  ],
};

export default topic;
