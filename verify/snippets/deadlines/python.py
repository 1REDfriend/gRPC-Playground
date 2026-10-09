# ---- Client: timeout is in seconds
try:
    order = stub.GetOrder(shop_pb2.GetOrderRequest(order_id="A-1001"), timeout=1.5)
except grpc.RpcError as e:
    if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
        order = cached_order()
    else:
        raise

# Cancelling: use the future form
future = stub.GetOrder.future(shop_pb2.GetOrderRequest(order_id="A-1001"))
future.cancel()  # -> CANCELLED


# ---- Server
class OrderService(shop_pb2_grpc.OrderServiceServicer):
    def GetOrder(self, request, context):
        print("time left:", context.time_remaining())
        context.add_callback(lambda: print("client gone, cleaning up"))
        for chunk in repo.scan(request.order_id):
            if not context.is_active():
                return shop_pb2.Order()  # nobody is listening any more
            ...
