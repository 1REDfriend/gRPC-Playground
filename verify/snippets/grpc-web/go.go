// grpc-go has no gRPC-Web support of its own. Two common routes:
//
// 1. Put Envoy in front (see envoy.yaml).
//
// 2. Serve with connect-go, which speaks gRPC, gRPC-Web and Connect
//    on the same handler, no proxy:
//
//    go install connectrpc.com/connect/cmd/protoc-gen-connect-go@latest
import (
	"context"
	"net/http"

	"connectrpc.com/connect"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	shopv1 "example.com/shop/gen/shopv1"
	"example.com/shop/gen/shopv1/shopv1connect"
)

type orderServer struct{}

func (s *orderServer) GetOrder(ctx context.Context, req *connect.Request[shopv1.GetOrderRequest]) (*connect.Response[shopv1.Order], error) {
	return connect.NewResponse(&shopv1.Order{Id: req.Msg.GetOrderId()}), nil
}

func main() {
	mux := http.NewServeMux()
	path, handler := shopv1connect.NewOrderServiceHandler(&orderServer{})
	mux.Handle(path, withCORS(handler))
	http.ListenAndServe(":50051", h2c.NewHandler(mux, &http2.Server{}))
}
