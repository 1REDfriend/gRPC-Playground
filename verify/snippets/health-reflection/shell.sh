# List services (needs reflection on the server)
grpcurl -plaintext localhost:50051 list

# Describe a service or message
grpcurl -plaintext localhost:50051 describe shop.v1.OrderService
grpcurl -plaintext localhost:50051 describe shop.v1.Order

# Call a method with JSON
grpcurl -plaintext -d '{"order_id": "A-1001"}' \
  localhost:50051 shop.v1.OrderService/GetOrder

# No reflection? Point grpcurl at the .proto instead
grpcurl -plaintext -import-path proto -proto shop/v1/shop.proto \
  -d '{"order_id": "A-1001"}' localhost:50051 shop.v1.OrderService/GetOrder

# Health check
grpcurl -plaintext -d '{"service": "shop.v1.OrderService"}' \
  localhost:50051 grpc.health.v1.Health/Check

# Kubernetes (1.24+) can probe gRPC health natively:
#   readinessProbe:
#     grpc:
#       port: 50051
#       service: shop.v1.OrderService
