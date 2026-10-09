// ---- Server: pass an object with code + details to the callback
server.addService(shop.OrderService.service, {
  async getOrder(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    const { orderId } = call.request;
    if (!/^A-\d+$/.test(orderId)) {
      return callback({ code: grpc.status.INVALID_ARGUMENT, details: 'order_id must match A-\\d+' });
    }
    const order = await repo.find(orderId);
    if (!order) {
      return callback({ code: grpc.status.NOT_FOUND, details: `order ${orderId} not found` });
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
// Rich details (google.rpc.Status) arrive in err.metadata.get('grpc-status-details-bin').
