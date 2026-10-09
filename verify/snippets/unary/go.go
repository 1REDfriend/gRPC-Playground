// server/main.go
package main

import (
	"context"
	"log"
	"net"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	shopv1 "example.com/shop/gen/shop/v1"
)

type orderServer struct {
	shopv1.UnimplementedOrderServiceServer
}

func (s *orderServer) GetOrder(ctx context.Context, req *shopv1.GetOrderRequest) (*shopv1.Order, error) {
	if req.GetOrderId() == "" {
		return nil, status.Error(codes.InvalidArgument, "order_id is required")
	}
	return &shopv1.Order{
		Id:         req.GetOrderId(),
		CustomerId: "C-42",
		TotalCents: 5970,
		Status:     shopv1.OrderStatus_ORDER_STATUS_PAID,
	}, nil
}

func main() {
	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatal(err)
	}
	s := grpc.NewServer()
	shopv1.RegisterOrderServiceServer(s, &orderServer{})
	log.Println("listening on :50051")
	log.Fatal(s.Serve(lis))
}

// client/main.go
// imports: context, log, time, google.golang.org/grpc,
// google.golang.org/grpc/credentials/insecure, shopv1
func main() {
	conn, err := grpc.NewClient("localhost:50051",
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()

	client := shopv1.NewOrderServiceClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	order, err := client.GetOrder(ctx, &shopv1.GetOrderRequest{OrderId: "A-1001"})
	if err != nil {
		log.Fatalf("GetOrder failed: %v", err)
	}
	log.Printf("order %s is %s", order.GetId(), order.GetStatus())
}
