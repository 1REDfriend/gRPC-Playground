// Server
func (s *orderServer) WatchOrder(req *shopv1.WatchOrderRequest, stream shopv1.OrderService_WatchOrderServer) error {
	updates := s.tracker.Subscribe(req.GetOrderId())
	defer s.tracker.Unsubscribe(updates)

	for {
		select {
		case <-stream.Context().Done(): // client went away or deadline hit
			return stream.Context().Err()
		case ev, ok := <-updates:
			if !ok {
				return nil // returning nil sends TRAILERS with grpc-status 0
			}
			if err := stream.Send(&shopv1.OrderEvent{Status: ev.Status, Note: ev.Note}); err != nil {
				return err
			}
		}
	}
}

// Client
stream, err := client.WatchOrder(ctx, &shopv1.WatchOrderRequest{OrderId: "A-1001"})
if err != nil {
	log.Fatal(err)
}
for {
	ev, err := stream.Recv()
	if err == io.EOF {
		break // server closed the stream cleanly
	}
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("%s: %s", ev.GetStatus(), ev.GetNote())
}
