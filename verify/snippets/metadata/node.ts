// ---- Client
const md = new grpc.Metadata();
md.set('authorization', `Bearer ${token}`);
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
});
