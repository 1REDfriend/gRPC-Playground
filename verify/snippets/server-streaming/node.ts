// Server
server.addService(shop.OrderService.service, {
  watchOrder(call: grpc.ServerWritableStream<any, any>) {
    const { orderId } = call.request;
    const unsubscribe = tracker.subscribe(orderId, (ev) => {
      call.write({ status: ev.status, note: ev.note });
      if (ev.status === 'ORDER_STATUS_DELIVERED') call.end(); // sends grpc-status 0
    });
    call.on('cancelled', unsubscribe);
    call.on('close', unsubscribe);
  },
});

// Client
const call = client.watchOrder({ orderId: 'A-1001' });
call.on('data', (ev: any) => console.log(`${ev.status}: ${ev.note}`));
call.on('end', () => console.log('stream finished'));
call.on('error', (err: grpc.ServiceError) => console.error(err.code, err.details));
