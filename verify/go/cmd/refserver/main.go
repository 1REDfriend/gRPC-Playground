// Small server for running the site's grpcurl commands: OrderService + health + reflection.
package main

import (
	"context"
	"log"
	"net"

	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"

	shopv1 "example.com/shop/gen/shop/v1"
)

type orderServer struct {
	shopv1.UnimplementedOrderServiceServer
}

func (s *orderServer) GetOrder(ctx context.Context, req *shopv1.GetOrderRequest) (*shopv1.Order, error) {
	return &shopv1.Order{Id: req.GetOrderId(), CustomerId: "C-42", TotalCents: 5970, Status: shopv1.OrderStatus_ORDER_STATUS_PAID}, nil
}

func main() {
	lis, err := net.Listen("tcp", "127.0.0.1:47214")
	if err != nil {
		log.Fatal(err)
	}
	s := grpc.NewServer()
	shopv1.RegisterOrderServiceServer(s, &orderServer{})
	hs := health.NewServer()
	healthpb.RegisterHealthServer(s, hs)
	hs.SetServingStatus("shop.v1.OrderService", healthpb.HealthCheckResponse_SERVING)
	reflection.Register(s)
	log.Fatal(s.Serve(lis))
}
