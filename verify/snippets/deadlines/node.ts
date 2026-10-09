// ---- Client: deadline is an absolute Date or ms timestamp
const call = client.getOrder(
  { orderId: 'A-1001' },
  { deadline: Date.now() + 1500 },
  (err: grpc.ServiceError | null, order: any) => {
    if (err?.code === grpc.status.DEADLINE_EXCEEDED) return showCachedOrder();
    if (err?.code === grpc.status.CANCELLED) return;
    if (err) throw err;
    render(order);
  },
);

cancelButton.onclick = () => call.cancel(); // -> CANCELLED

// ---- Server: stop work when the client goes away
server.addService(shop.OrderService.service, {
  async getOrder(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    const abort = new AbortController();
    call.on('cancelled', () => abort.abort()); // fires on deadline or client cancel
    try {
      callback(null, await db.findOrder(call.request.orderId, { signal: abort.signal }));
    } catch (e) {
      if (!call.cancelled) callback({ code: grpc.status.INTERNAL, details: String(e) });
    }
  },
});
