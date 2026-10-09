const client = new shop.OrderService('dns:///orders.internal:50051', creds, {
  'grpc.service_config': JSON.stringify({
    loadBalancingConfig: [{ round_robin: {} }],
  }),
});
