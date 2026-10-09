import json
import grpc

service_config = {
    "methodConfig": [{
        "name": [{"service": "shop.v1.OrderService", "method": "GetOrder"}],
        "retryPolicy": {
            "maxAttempts": 4,
            "initialBackoff": "0.5s",
            "maxBackoff": "5s",
            "backoffMultiplier": 2,
            "retryableStatusCodes": ["UNAVAILABLE"],
        },
    }]
}

channel = grpc.secure_channel("orders.internal:50051", creds, options=[
    ("grpc.service_config", json.dumps(service_config)),
    ("grpc.enable_retries", 1),  # already the default in recent versions
    ("grpc.keepalive_time_ms", 30_000),
    ("grpc.keepalive_timeout_ms", 10_000),
    ("grpc.keepalive_permit_without_calls", 1),
])

# Server side
server = grpc.server(executor, options=[
    ("grpc.keepalive_permit_without_calls", 1),
    ("grpc.http2.min_ping_interval_without_data_ms", 20_000),
])
