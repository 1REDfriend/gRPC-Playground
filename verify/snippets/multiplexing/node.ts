import { promisify } from 'node:util';

// Create the client once at startup and reuse it everywhere.
const client = new shop.OrderService('orders.internal:50051', grpc.credentials.createInsecure());
const getOrder = promisify(client.getOrder.bind(client));

// Three concurrent calls, multiplexed over the same HTTP/2 connection.
const orders = await Promise.all(
  ['A-1001', 'A-1002', 'A-1003'].map((orderId) => getOrder({ orderId })),
);
console.log(orders.map((o: any) => o.status));
