// "dns:///" makes the client resolve every address and balance across them itself.
conn, err := grpc.NewClient("dns:///orders.internal:50051",
	grpc.WithTransportCredentials(creds),
	grpc.WithDefaultServiceConfig(`{"loadBalancingConfig": [{"round_robin": {}}]}`),
)
