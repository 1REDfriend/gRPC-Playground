// Corrected copy of the gRPC-Web Go snippet (connect-go).
package main

import (
	"context"
	"net/http"
	"os"

	"connectrpc.com/connect"
	connectcors "connectrpc.com/cors"
	"github.com/rs/cors"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	shopv1 "example.com/shop/gen/shop/v1"
	"example.com/shop/gen/shop/v1/shopv1connect"
)

type orderServer struct {
	shopv1connect.UnimplementedOrderServiceHandler
}

func (s *orderServer) GetOrder(ctx context.Context, req *connect.Request[shopv1.GetOrderRequest]) (*connect.Response[shopv1.Order], error) {
	return connect.NewResponse(&shopv1.Order{Id: req.Msg.GetOrderId()}), nil
}

// WatchOrder is not part of the site snippet; it lets the browser test exercise server streaming.
func (s *orderServer) WatchOrder(ctx context.Context, req *connect.Request[shopv1.WatchOrderRequest], stream *connect.ServerStream[shopv1.OrderEvent]) error {
	for _, st := range []shopv1.OrderStatus{shopv1.OrderStatus_ORDER_STATUS_PAID, shopv1.OrderStatus_ORDER_STATUS_SHIPPED} {
		if err := stream.Send(&shopv1.OrderEvent{Status: st, Note: "update"}); err != nil {
			return err
		}
	}
	return nil
}

func withCORS(h http.Handler) http.Handler {
	return cors.New(cors.Options{
		AllowedOrigins: []string{"https://shop.example.com"},
		AllowedMethods: connectcors.AllowedMethods(),
		AllowedHeaders: connectcors.AllowedHeaders(),
		ExposedHeaders: connectcors.ExposedHeaders(),
	}).Handler(h)
}

func newHandler() http.Handler {
	mux := http.NewServeMux()
	path, handler := shopv1connect.NewOrderServiceHandler(&orderServer{})
	mux.Handle(path, withCORS(handler))
	return h2c.NewHandler(mux, &http2.Server{})
}

func main() {
	addr := ":50051"
	if p := os.Getenv("PORT"); p != "" {
		addr = ":" + p
	}
	http.ListenAndServe(addr, newHandler())
}
