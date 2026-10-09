// Server: reading and writing are independent
func (s *orderServer) SupportChat(stream shopv1.OrderService_SupportChatServer) error {
	if err := stream.Send(&shopv1.ChatMessage{From: "bot", Text: "Hi! How can I help?"}); err != nil {
		return err
	}
	for {
		in, err := stream.Recv()
		if err == io.EOF {
			return stream.Send(&shopv1.ChatMessage{From: "bot", Text: "Have a nice day!"})
		}
		if err != nil {
			return err
		}
		for _, reply := range s.bot.Answer(in.GetText()) {
			if err := stream.Send(&shopv1.ChatMessage{From: "bot", Text: reply}); err != nil {
				return err
			}
		}
	}
}

// Client: receive in a goroutine, send from the main flow
stream, err := client.SupportChat(ctx)
if err != nil {
	log.Fatal(err)
}
done := make(chan struct{})
go func() {
	defer close(done)
	for {
		m, err := stream.Recv()
		if err != nil { // io.EOF when the server finishes
			return
		}
		fmt.Printf("%s: %s\n", m.GetFrom(), m.GetText())
	}
}()
for _, line := range []string{"Where is order A-1001?", "Thanks!"} {
	stream.Send(&shopv1.ChatMessage{From: "C-42", Text: line})
}
stream.CloseSend() // half-close
<-done
