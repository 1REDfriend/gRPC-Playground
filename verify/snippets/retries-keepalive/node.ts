const serviceConfig = {
  methodConfig: [
    {
      name: [{ service: 'shop.v1.OrderService', method: 'GetOrder' }],
      retryPolicy: {
        maxAttempts: 4,
        initialBackoff: '0.5s',
        maxBackoff: '5s',
        backoffMultiplier: 2,
        retryableStatusCodes: ['UNAVAILABLE'],
      },
    },
  ],
};

const client = new shop.OrderService('orders.internal:50051', creds, {
  'grpc.service_config': JSON.stringify(serviceConfig),
  'grpc.keepalive_time_ms': 30_000,
  'grpc.keepalive_timeout_ms': 10_000,
  'grpc.keepalive_permit_without_calls': 1,
});

// Server side
const server = new grpc.Server({
  'grpc.keepalive_permit_without_calls': 1,
  'grpc.http2.min_ping_interval_without_data_ms': 20_000,
});
