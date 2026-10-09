import type { TopicModule } from '../../../lib/types';
import { SERVER, grpcFrame, l, req, requestHeaders, trailers } from '../../shared';

const topic: TopicModule = {
  slug: 'grpc-web',
  sim: {
    build: () => ({
      actors: [
        { id: 'browser', label: l('Browser', 'Browser') },
        { id: 'proxy', label: l('Envoy (proxy)', 'Envoy (proxy)') },
        SERVER,
      ],
      events: [
        {
          at: 0,
          from: 'browser',
          to: 'proxy',
          kind: 'http',
          label: 'POST application/grpc-web+proto',
          detail:
            'POST /shop.v1.OrderService/GetOrder HTTP/1.1\nHost: api.shop.example.com\nContent-Type: application/grpc-web+proto\nX-Grpc-Web: 1\nAccept: application/grpc-web+proto\n\n' +
            grpcFrame(req.getOrder(), 'GetOrderRequest'),
          note: l('เบราว์เซอร์ใช้ fetch ธรรมดา ส่งได้ทั้ง HTTP/1.1 และ HTTP/2', 'The browser uses plain fetch, over HTTP/1.1 or HTTP/2.'),
        },
        {
          at: 800,
          from: 'proxy',
          to: 'proxy',
          kind: 'note',
          label: 'grpc_web filter: translate',
          note: l('proxy แปลงคำขอ gRPC-Web เป็น gRPC จริง', 'The proxy translates gRPC-Web into real gRPC.'),
        },
        {
          at: 1050,
          from: 'proxy',
          to: 'server',
          kind: 'headers',
          label: 'HTTP/2 HEADERS + DATA (application/grpc)',
          detail: requestHeaders('GetOrder'),
        },
        { at: 1900, from: 'server', to: 'proxy', kind: 'data', label: 'HEADERS, DATA Order', detail: grpcFrame(req.order(), 'Order') },
        { at: 2150, from: 'server', to: 'proxy', kind: 'trailers', label: 'TRAILERS grpc-status 0', detail: trailers(0) },
        {
          at: 2900,
          from: 'proxy',
          to: 'proxy',
          kind: 'note',
          label: 'move trailers into the body',
          note: l('เบราว์เซอร์อ่าน HTTP trailers ไม่ได้ proxy เลยยัด trailers ไว้ท้าย body แทน', 'Browsers cannot read HTTP trailers, so the proxy appends them to the body.'),
        },
        {
          at: 3150,
          from: 'proxy',
          to: 'browser',
          kind: 'http',
          label: '200 OK body = [message][trailer frame]',
          detail:
            'HTTP/1.1 200 OK\nContent-Type: application/grpc-web+proto\n\nbody:\n' +
            grpcFrame(req.order(), 'Order') +
            '\n\n80              flag 0x80 = trailer frame\n00 00 00 0f     length = 15\ngrpc-status:0\\r\\n',
          note: l('ใน body มีสองก้อน message ตามด้วย trailer frame ที่ขึ้นต้นด้วย flag 0x80', 'Two chunks in the body: the message, then a trailer frame flagged 0x80.'),
        },
        {
          at: 3900,
          from: 'browser',
          to: 'browser',
          kind: 'note',
          label: 'client lib decodes → order.status',
          note: l('library ฝั่งเบราว์เซอร์แยกสองก้อนออกจากกัน แล้วคืน object ที่มี type ให้คุณ', 'The browser library splits the chunks and hands you a typed object.'),
        },
      ],
      outcome: { ok: true, text: l('เบราว์เซอร์เรียก gRPC service ได้ โดยมี proxy ช่วยแปลง', 'The browser reached a gRPC service, with a proxy translating.') },
    }),
  },
  code: [
    {
      id: 'browser',
      lang: 'typescript',
      label: 'Browser (TS)',
      code: `// npm install @connectrpc/connect @connectrpc/connect-web @bufbuild/protobuf
// Generate shop_pb.ts with: buf generate  (plugin: buf.build/bufbuild/es)
import { createClient } from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-web';
import { OrderService } from './gen/shop/v1/shop_pb';

const transport = createGrpcWebTransport({
  baseUrl: 'https://api.shop.example.com',
});
const client = createClient(OrderService, transport);

// Unary
const order = await client.getOrder({ orderId: 'A-1001' }, { timeoutMs: 2000 });
console.log(order.status);

// Server streaming also works over gRPC-Web (client streaming and bidi do not)
for await (const ev of client.watchOrder({ orderId: 'A-1001' })) {
  console.log(ev.status, ev.note);
}`,
    },
    {
      id: 'config',
      lang: 'yaml',
      label: 'envoy.yaml',
      code: `static_resources:
  listeners:
    - name: grpc_web
      address:
        socket_address: { address: 0.0.0.0, port_value: 8443 }
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: grpc_web
                route_config:
                  virtual_hosts:
                    - name: shop
                      domains: ["*"]
                      routes:
                        - match: { prefix: "/shop.v1.OrderService/" }
                          route: { cluster: order_service, timeout: 0s }
                      typed_per_filter_config:
                        envoy.filters.http.cors:
                          "@type": type.googleapis.com/envoy.extensions.filters.http.cors.v3.CorsPolicy
                          allow_origin_string_match: [{ exact: "https://shop.example.com" }]
                          allow_methods: "POST, OPTIONS"
                          allow_headers: "content-type, x-grpc-web, x-user-agent, grpc-timeout, authorization"
                          expose_headers: "grpc-status, grpc-message"
                http_filters:
                  - name: envoy.filters.http.grpc_web
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.grpc_web.v3.GrpcWeb
                  - name: envoy.filters.http.cors
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.cors.v3.Cors
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router
  clusters:
    - name: order_service
      type: LOGICAL_DNS
      lb_policy: ROUND_ROBIN
      typed_extension_protocol_options:
        envoy.extensions.upstreams.http.v3.HttpProtocolOptions:
          "@type": type.googleapis.com/envoy.extensions.upstreams.http.v3.HttpProtocolOptions
          explicit_http_config:
            http2_protocol_options: {}
      load_assignment:
        cluster_name: order_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address: { address: orders, port_value: 50051 }`,
    },
    {
      id: 'csharp',
      lang: 'csharp',
      code: `// ASP.NET Core speaks gRPC-Web itself, no proxy needed.
// dotnet add package Grpc.AspNetCore.Web
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddGrpc();
builder.Services.AddCors(o => o.AddPolicy("web", p => p
    .WithOrigins("https://shop.example.com")
    .AllowAnyHeader()
    .WithMethods("POST", "OPTIONS")
    .WithExposedHeaders("Grpc-Status", "Grpc-Message", "Grpc-Encoding", "Grpc-Accept-Encoding")));

var app = builder.Build();
app.UseGrpcWeb();
app.UseCors();
app.MapGrpcService<OrderServiceImpl>()
   .EnableGrpcWeb()
   .RequireCors("web");
app.Run();`,
    },
    {
      id: 'go',
      lang: 'go',
      code: `// grpc-go has no gRPC-Web support of its own. Two common routes:
//
// 1. Put Envoy in front (see envoy.yaml).
//
// 2. Serve with connect-go, which speaks gRPC, gRPC-Web and Connect
//    on the same handler, no proxy:
//
//    go install connectrpc.com/connect/cmd/protoc-gen-connect-go@latest
import (
	"context"
	"net/http"

	"connectrpc.com/connect"
	connectcors "connectrpc.com/cors"
	"github.com/rs/cors"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	shopv1 "example.com/shop/gen/shop/v1"
	"example.com/shop/gen/shop/v1/shopv1connect"
)

type orderServer struct {
	// Methods you don't implement answer CodeUnimplemented.
	shopv1connect.UnimplementedOrderServiceHandler
}

func (s *orderServer) GetOrder(ctx context.Context, req *connect.Request[shopv1.GetOrderRequest]) (*connect.Response[shopv1.Order], error) {
	return connect.NewResponse(&shopv1.Order{Id: req.Msg.GetOrderId()}), nil
}

// Browsers on another origin need CORS; connectrpc.com/cors lists the headers gRPC-Web uses.
func withCORS(h http.Handler) http.Handler {
	return cors.New(cors.Options{
		AllowedOrigins: []string{"https://shop.example.com"},
		AllowedMethods: connectcors.AllowedMethods(),
		AllowedHeaders: connectcors.AllowedHeaders(),
		ExposedHeaders: connectcors.ExposedHeaders(),
	}).Handler(h)
}

func main() {
	mux := http.NewServeMux()
	path, handler := shopv1connect.NewOrderServiceHandler(&orderServer{})
	mux.Handle(path, withCORS(handler))
	http.ListenAndServe(":50051", h2c.NewHandler(mux, &http2.Server{}))
}`,
    },
  ],
};

export default topic;
