# server.py
from concurrent import futures

import grpc
import shop_pb2
import shop_pb2_grpc


class OrderService(shop_pb2_grpc.OrderServiceServicer):
    def GetOrder(self, request, context):
        if not request.order_id:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "order_id is required")
        return shop_pb2.Order(
            id=request.order_id,
            customer_id="C-42",
            total_cents=5970,
            status=shop_pb2.ORDER_STATUS_PAID,
        )


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    shop_pb2_grpc.add_OrderServiceServicer_to_server(OrderService(), server)
    server.add_insecure_port("[::]:50051")
    server.start()
    print("listening on :50051")
    server.wait_for_termination()


# client.py
def call_get_order():
    with grpc.insecure_channel("localhost:50051") as channel:
        stub = shop_pb2_grpc.OrderServiceStub(channel)
        order = stub.GetOrder(shop_pb2.GetOrderRequest(order_id="A-1001"), timeout=2.0)
        print(f"order {order.id} is {shop_pb2.OrderStatus.Name(order.status)}")
