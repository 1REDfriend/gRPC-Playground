// ---- Client: every call gets a deadline via the context
ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
defer cancel() // calling cancel() early also cancels the RPC

order, err := client.GetOrder(ctx, &shopv1.GetOrderRequest{OrderId: "A-1001"})
switch status.Code(err) {
case codes.OK:
	log.Println(order.GetStatus())
case codes.DeadlineExceeded:
	log.Println("too slow, show cached data instead")
case codes.Canceled:
	log.Println("cancelled")
}

// ---- Server: pass ctx down so the deadline reaches the database too
func (s *orderServer) GetOrder(ctx context.Context, req *shopv1.GetOrderRequest) (*shopv1.Order, error) {
	if dl, ok := ctx.Deadline(); ok {
		log.Printf("time left: %v", time.Until(dl))
	}
	row := s.db.QueryRowContext(ctx, "SELECT ... WHERE id = $1", req.GetOrderId())
	// If the client gives up, ctx is cancelled and the query is aborted.
	...
}
