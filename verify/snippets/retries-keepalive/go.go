const serviceConfig = `{
  "methodConfig": [{
    "name": [{"service": "shop.v1.OrderService", "method": "GetOrder"}],
    "retryPolicy": {
      "maxAttempts": 4,
      "initialBackoff": "0.5s",
      "maxBackoff": "5s",
      "backoffMultiplier": 2,
      "retryableStatusCodes": ["UNAVAILABLE"]
    }
  }]
}`

conn, err := grpc.NewClient("orders.internal:50051",
	grpc.WithTransportCredentials(creds),
	grpc.WithDefaultServiceConfig(serviceConfig),
	grpc.WithKeepaliveParams(keepalive.ClientParameters{
		Time:                30 * time.Second, // ping after 30s of inactivity
		Timeout:             10 * time.Second, // dead if no ACK within 10s
		PermitWithoutStream: true,             // ping even when no RPC is active
	}),
)

// Server: allow those pings, or it will close the connection with "too_many_pings"
s := grpc.NewServer(
	grpc.KeepaliveEnforcementPolicy(keepalive.EnforcementPolicy{
		MinTime:             20 * time.Second,
		PermitWithoutStream: true,
	}),
)
