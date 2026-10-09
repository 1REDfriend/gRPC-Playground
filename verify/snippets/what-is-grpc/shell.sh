# REST: you agree on URLs and JSON shapes by convention (and hope the docs are current)
curl -X GET https://api.example.com/orders/A-1001 \
  -H "Accept: application/json"

# gRPC: the method and message types come from shop.proto
# grpcurl is "curl for gRPC"; it reads the schema via reflection or the .proto file
grpcurl -plaintext \
  -d '{"order_id": "A-1001"}' \
  localhost:50051 shop.v1.OrderService/GetOrder
