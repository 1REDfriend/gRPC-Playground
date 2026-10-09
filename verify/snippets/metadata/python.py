# ---- Client: with_call returns the response plus a call object
order, call = stub.GetOrder.with_call(
    shop_pb2.GetOrderRequest(order_id="A-1001"),
    metadata=(("authorization", f"Bearer {token}"), ("x-request-id", req_id)),
)
print(dict(call.initial_metadata()).get("x-served-by"))
print(dict(call.trailing_metadata()).get("x-db-time-ms"))


# ---- Server
class OrderService(shop_pb2_grpc.OrderServiceServicer):
    def GetOrder(self, request, context):
        md = dict(context.invocation_metadata())
        auth = md.get("authorization")

        context.send_initial_metadata((("x-served-by", HOSTNAME),))
        order = repo.find(request.order_id, auth)
        context.set_trailing_metadata((("x-db-time-ms", "12"),))
        return order
