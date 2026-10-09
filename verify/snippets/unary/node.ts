// server.ts
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
  console.log(`listening on :${port}`);
});

// client.ts
const client = new shop.OrderService('localhost:50051', grpc.credentials.createInsecure());

client.getOrder({ orderId: 'A-1001' }, (err: grpc.ServiceError | null, order: any) => {
  if (err) {
    console.error('GetOrder failed:', err.code, err.details);
    return;
  }
  console.log(`order ${order.id} is ${order.status}`);
});
