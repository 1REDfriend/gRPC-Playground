# Server: a generator. Each yield becomes one DATA frame.
class OrderService(shop_pb2_grpc.OrderServiceServicer):
    def WatchOrder(self, request, context):
        for ev in tracker.follow(request.order_id):
            if not context.is_active():   # client cancelled
                return
            yield shop_pb2.OrderEvent(status=ev.status, note=ev.note)
        # falling off the end sends grpc-status 0


# Client: the call returns an iterator
for ev in stub.WatchOrder(shop_pb2.WatchOrderRequest(order_id="A-1001")):
    print(shop_pb2.OrderStatus.Name(ev.status), ev.note)
