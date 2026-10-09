// Server
func (s *orderServer) UploadItems(stream shopv1.OrderService_UploadItemsServer) error {
	var count int32
	var total int64
	for {
		item, err := stream.Recv()
		if err == io.EOF {
			// client half-closed: send the single response and finish
			return stream.SendAndClose(&shopv1.UploadSummary{ItemCount: count, TotalCents: total})
		}
		if err != nil {
			return err
		}
		count++
		total += int64(item.GetQuantity()) * item.GetPriceCents()
	}
}

// Client
stream, err := client.UploadItems(ctx)
if err != nil {
	log.Fatal(err)
}
for _, it := range cart {
	if err := stream.Send(it); err != nil {
		log.Fatal(err)
	}
}
summary, err := stream.CloseAndRecv() // half-close, then wait for the response
if err != nil {
	log.Fatal(err)
}
log.Printf("uploaded %d items, total %d", summary.GetItemCount(), summary.GetTotalCents())
