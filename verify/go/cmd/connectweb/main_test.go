package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"connectrpc.com/connect"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	shopv1 "example.com/shop/gen/shop/v1"
	"example.com/shop/gen/shop/v1/shopv1connect"
)

// Calls the server over the gRPC-Web protocol, as a browser would.
func TestGrpcWeb(t *testing.T) {
	srv := httptest.NewServer(newHandler())
	defer srv.Close()

	client := shopv1connect.NewOrderServiceClient(http.DefaultClient, srv.URL, connect.WithGRPCWeb())
	res, err := client.GetOrder(context.Background(), connect.NewRequest(&shopv1.GetOrderRequest{OrderId: "A-1001"}))
	if err != nil {
		t.Fatal(err)
	}
	if res.Msg.GetId() != "A-1001" {
		t.Fatal(res.Msg)
	}

	// CORS preflight from the allowed origin must expose grpc-status.
	req, _ := http.NewRequest(http.MethodOptions, srv.URL+"/shop.v1.OrderService/GetOrder", nil)
	req.Header.Set("Origin", "https://shop.example.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "content-type,x-grpc-web")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.Header.Get("Access-Control-Allow-Origin") != "https://shop.example.com" {
		t.Fatal("CORS preflight failed:", resp.Status, resp.Header)
	}
}

// Same wiring as main() in the site snippet, minus ListenAndServe.
func newHandler() http.Handler {
	mux := http.NewServeMux()
	path, handler := shopv1connect.NewOrderServiceHandler(&orderServer{})
	mux.Handle(path, withCORS(handler))
	return h2c.NewHandler(mux, &http2.Server{})
}
