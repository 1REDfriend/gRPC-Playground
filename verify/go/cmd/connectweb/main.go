package main
import (
	"context"
	"net/http"

	"connectrpc.com/connect"
	connectcors "connectrpc.com/cors"
	"github.com/rs/cors"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	shopv1 "example.com/shop/gen/shop/v1"
	"example.com/shop/gen/shop/v1/shopv1connect"
)

type orderServer struct {
	// Methods you don't implement answer CodeUnimplemented.
	shopv1connect.UnimplementedOrderServiceHandler
}

func (s *orderServer) GetOrder(ctx context.Context, req *connect.Request[shopv1.GetOrderRequest]) (*connect.Response[shopv1.Order], error) {
	return connect.NewResponse(&shopv1.Order{Id: req.Msg.GetOrderId()}), nil
}

func withCORS(h http.Handler) http.Handler {
	return cors.New(cors.Options{
		AllowedOrigins: []string{"https://shop.example.com"},
		AllowedMethods: connectcors.AllowedMethods(),
		AllowedHeaders: connectcors.AllowedHeaders(),
		ExposedHeaders: connectcors.ExposedHeaders(),
	}).Handler(h)
}

func main() {
	mux := http.NewServeMux()
	path, handler := shopv1connect.NewOrderServiceHandler(&orderServer{})
	mux.Handle(path, withCORS(handler))
	http.ListenAndServe(":50051", h2c.NewHandler(mux, &http2.Server{}))
}
