// npm install @connectrpc/connect @connectrpc/connect-web @bufbuild/protobuf
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
}
