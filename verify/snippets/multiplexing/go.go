// One ClientConn = one (or a few) HTTP/2 connections. Share it; do NOT dial per request.
conn, err := grpc.NewClient("orders.internal:50051",
	grpc.WithTransportCredentials(insecure.NewCredentials()))
if err != nil {
	log.Fatal(err)
}
defer conn.Close()
client := shopv1.NewOrderServiceClient(conn)

// Fire three calls concurrently. Each gets its own HTTP/2 stream on the same connection.
var wg sync.WaitGroup
for _, id := range []string{"A-1001", "A-1002", "A-1003"} {
	wg.Add(1)
	go func(id string) {
		defer wg.Done()
		order, err := client.GetOrder(ctx, &shopv1.GetOrderRequest{OrderId: id})
		if err != nil {
			log.Printf("%s: %v", id, err)
			return
		}
		log.Printf("%s: %s", id, order.GetStatus())
	}(id)
}
wg.Wait()
