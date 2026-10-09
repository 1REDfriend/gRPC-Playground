# pip install grpcio-health-checking grpcio-reflection
from grpc_health.v1 import health, health_pb2, health_pb2_grpc
from grpc_reflection.v1alpha import reflection

health_servicer = health.HealthServicer()
health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)
health_servicer.set("shop.v1.OrderService", health_pb2.HealthCheckResponse.SERVING)

SERVICE_NAMES = (
    shop_pb2.DESCRIPTOR.services_by_name["OrderService"].full_name,
    reflection.SERVICE_NAME,
)
reflection.enable_server_reflection(SERVICE_NAMES, server)

# Later:
health_servicer.set("shop.v1.OrderService", health_pb2.HealthCheckResponse.NOT_SERVING)
