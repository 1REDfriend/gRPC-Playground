# pip install grpcio-status googleapis-common-protos
from google.protobuf import any_pb2
from google.rpc import code_pb2, error_details_pb2, status_pb2
from grpc_status import rpc_status


# ---- Server
class OrderService(shop_pb2_grpc.OrderServiceServicer):
    def GetOrder(self, request, context):
        if not VALID_ID.match(request.order_id):
            detail = any_pb2.Any()
            detail.Pack(error_details_pb2.BadRequest(field_violations=[
                error_details_pb2.BadRequest.FieldViolation(
                    field="order_id", description="must match A-\\d+"),
            ]))
            context.abort_with_status(rpc_status.to_status(status_pb2.Status(
                code=code_pb2.INVALID_ARGUMENT, message="invalid order_id", details=[detail])))

        order = repo.find(request.order_id)
        if order is None:
            context.abort(grpc.StatusCode.NOT_FOUND, f"order {request.order_id} not found")
        return order


# ---- Client
try:
    order = stub.GetOrder(shop_pb2.GetOrderRequest(order_id="A-9999"), timeout=2)
except grpc.RpcError as e:
    if e.code() == grpc.StatusCode.NOT_FOUND:
        show_not_found()
    else:
        status = rpc_status.from_call(e)   # None if there are no rich details
        print(e.code(), e.details(), status)
