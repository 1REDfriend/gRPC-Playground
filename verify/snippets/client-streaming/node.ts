// Server
server.addService(shop.OrderService.service, {
  uploadItems(call: grpc.ServerReadableStream<any, any>, callback: grpc.sendUnaryData<any>) {
    let itemCount = 0;
    let totalCents = 0;
    call.on('data', (item: any) => {
      itemCount++;
      totalCents += item.quantity * item.priceCents;
    });
    call.on('end', () => callback(null, { itemCount, totalCents }));
    call.on('error', (err) => console.error(err));
  },
});

// Client
const call = client.uploadItems((err: grpc.ServiceError | null, summary: any) => {
  if (err) return console.error(err.code, err.details);
  console.log(`uploaded ${summary.itemCount} items, total ${summary.totalCents}`);
});
for (const item of cart) call.write(item);
call.end(); // half-close
