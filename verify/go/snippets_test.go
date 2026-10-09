// Runs the Go snippets from the site against real in-process servers.
// Handler and client bodies are copied from the snippets; only stubs (tracker,
// repo, bot, cart, verifyJWT) and listener plumbing are added.
package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/keepalive"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/peer"
	"google.golang.org/grpc/reflection"
	reflectionpb "google.golang.org/grpc/reflection/grpc_reflection_v1"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"

	shopv1 "example.com/shop/gen/shop/v1"
)

// ---------------------------------------------------------------- helpers

func serve(t *testing.T, s *grpc.Server) string {
	t.Helper()
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go s.Serve(lis)
	t.Cleanup(s.Stop)
	return lis.Addr().String()
}

func dial(t *testing.T, addr string, opts ...grpc.DialOption) shopv1.OrderServiceClient {
	t.Helper()
	if len(opts) == 0 {
		opts = []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}
	}
	conn, err := grpc.NewClient(addr, opts...)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	return shopv1.NewOrderServiceClient(conn)
}

// ---------------------------------------------------------------- protobuf

func TestProtobufRoundTrip(t *testing.T) {
	item := &shopv1.Item{Sku: "SKU-1007", Quantity: 150}

	data, err := proto.Marshal(item) // []byte, 13 bytes
	if err != nil {
		log.Fatal(err)
	}

	var decoded shopv1.Item
	if err := proto.Unmarshal(data, &decoded); err != nil {
		log.Fatal(err)
	}
	log.Printf("%x -> %s x%d", data, decoded.GetSku(), decoded.GetQuantity())
	if fmt.Sprintf("%x", data) != "0a08534b552d31303037109601" || len(data) != 13 {
		t.Fatalf("unexpected bytes %x", data)
	}
}

// ---------------------------------------------------------------- unary

type orderServer struct {
	shopv1.UnimplementedOrderServiceServer
	tracker *tracker
	bot     *bot
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

func TestUnary(t *testing.T) {
	s := grpc.NewServer()
	shopv1.RegisterOrderServiceServer(s, &orderServer{})
	addr := serve(t, s)

	conn, err := grpc.NewClient(addr,
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
	if order.GetStatus() != shopv1.OrderStatus_ORDER_STATUS_PAID {
		t.Fatal(order)
	}
	if _, err := client.GetOrder(ctx, &shopv1.GetOrderRequest{}); status.Code(err) != codes.InvalidArgument {
		t.Fatal(err)
	}
}

// ---------------------------------------------------------------- streaming

type event struct {
	Status shopv1.OrderStatus
	Note   string
}

type tracker struct{}

func (tracker) Subscribe(string) chan event {
	ch := make(chan event, 4)
	ch <- event{shopv1.OrderStatus_ORDER_STATUS_PENDING, "payment received"}
	ch <- event{shopv1.OrderStatus_ORDER_STATUS_PAID, "packing"}
	ch <- event{shopv1.OrderStatus_ORDER_STATUS_SHIPPED, "with courier"}
	ch <- event{shopv1.OrderStatus_ORDER_STATUS_DELIVERED, "signed"}
	close(ch)
	return ch
}
func (tracker) Unsubscribe(chan event) {}

type bot struct{}

func (bot) Answer(text string) []string {
	if strings.Contains(text, "order") {
		return []string{"Checking...", "Out for delivery"}
	}
	return []string{"You're welcome"}
}

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

func streamClient(t *testing.T) shopv1.OrderServiceClient {
	s := grpc.NewServer()
	shopv1.RegisterOrderServiceServer(s, &orderServer{tracker: &tracker{}, bot: &bot{}})
	return dial(t, serve(t, s))
}

func TestServerStreaming(t *testing.T) {
	client := streamClient(t)
	ctx := context.Background()
	var got []string

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
		got = append(got, ev.GetNote())
	}
	if len(got) != 4 {
		t.Fatal(got)
	}
}

func TestClientStreaming(t *testing.T) {
	client := streamClient(t)
	ctx := context.Background()
	cart := []*shopv1.Item{{Sku: "SKU-1", Quantity: 2, PriceCents: 100}, {Sku: "SKU-2", Quantity: 1, PriceCents: 250}}

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
	if summary.GetItemCount() != 2 || summary.GetTotalCents() != 450 {
		t.Fatal(summary)
	}
}

func TestBidi(t *testing.T) {
	client := streamClient(t)
	ctx := context.Background()
	var n atomic.Int32

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
			n.Add(1)
		}
	}()
	for _, line := range []string{"Where is order A-1001?", "Thanks!"} {
		stream.Send(&shopv1.ChatMessage{From: "C-42", Text: line})
	}
	stream.CloseSend() // half-close
	<-done
	if n.Load() != 5 {
		t.Fatal(n.Load())
	}
}

// ---------------------------------------------------------------- multiplexing

func TestMultiplexing(t *testing.T) {
	s := grpc.NewServer()
	shopv1.RegisterOrderServiceServer(s, &orderServer{})
	addr := serve(t, s)
	ctx := context.Background()
	var ok atomic.Int32

	conn, err := grpc.NewClient(addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()
	client := shopv1.NewOrderServiceClient(conn)

	var wg sync.WaitGroup
	for _, id := range []string{"A-1001", "A-1002", "A-1003"} {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			order, err := client.GetOrder(ctx, &shopv1.GetOrderRequest{OrderId: id})
			if err != nil {
				log.Printf("%s: %v", id, err)
				return
			}
			log.Printf("%s: %s", id, order.GetStatus())
			ok.Add(1)
		}(id)
	}
	wg.Wait()
	if ok.Load() != 3 {
		t.Fatal(ok.Load())
	}
}

// ---------------------------------------------------------------- metadata

type repo struct{}

func (repo) Find(ctx context.Context, id string, _ ...any) (*shopv1.Order, error) {
	if id == "A-9999" {
		return nil, sql.ErrNoRows
	}
	return &shopv1.Order{Id: id}, nil
}

type metadataServer struct {
	shopv1.UnimplementedOrderServiceServer
	repo repo
}

var hostname = "pod-2"

func (s *metadataServer) GetOrder(ctx context.Context, req *shopv1.GetOrderRequest) (*shopv1.Order, error) {
	md, _ := metadata.FromIncomingContext(ctx)
	auth := md.Get("authorization") // []string, keys are always lowercase

	grpc.SetHeader(ctx, metadata.Pairs("x-served-by", hostname))
	start := time.Now()
	order, err := s.repo.Find(ctx, req.GetOrderId(), auth)
	grpc.SetTrailer(ctx, metadata.Pairs("x-db-time-ms", strconv.FormatInt(time.Since(start).Milliseconds(), 10)))
	return order, err
}

func TestMetadata(t *testing.T) {
	s := grpc.NewServer()
	shopv1.RegisterOrderServiceServer(s, &metadataServer{})
	client := dial(t, serve(t, s))
	ctx := context.Background()
	token, reqID := "t0k", "7f3c9a"
	req := &shopv1.GetOrderRequest{OrderId: "A-1001"}

	ctx = metadata.AppendToOutgoingContext(ctx,
		"authorization", "Bearer "+token,
		"x-request-id", reqID,
	)
	var header, trailer metadata.MD
	order, err := client.GetOrder(ctx, req, grpc.Header(&header), grpc.Trailer(&trailer))
	log.Println(header.Get("x-served-by"), trailer.Get("x-db-time-ms"))
	if err != nil || order.GetId() != "A-1001" || header.Get("x-served-by")[0] != "pod-2" || len(trailer.Get("x-db-time-ms")) != 1 {
		t.Fatal(err, header, trailer)
	}
}

// ---------------------------------------------------------------- deadlines

type slowServer struct {
	shopv1.UnimplementedOrderServiceServer
	aborted chan struct{}
}

func (s *slowServer) GetOrder(ctx context.Context, req *shopv1.GetOrderRequest) (*shopv1.Order, error) {
	if dl, ok := ctx.Deadline(); ok {
		log.Printf("time left: %v", time.Until(dl))
	}
	select { // stands in for s.db.QueryRowContext(ctx, ...)
	case <-time.After(3 * time.Second):
		return &shopv1.Order{Id: req.GetOrderId()}, nil
	case <-ctx.Done():
		close(s.aborted)
		return nil, ctx.Err()
	}
}

func TestDeadline(t *testing.T) {
	slow := &slowServer{aborted: make(chan struct{})}
	s := grpc.NewServer()
	shopv1.RegisterOrderServiceServer(s, slow)
	client := dial(t, serve(t, s))
	var got codes.Code

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
	got = status.Code(err)
	if got != codes.DeadlineExceeded {
		t.Fatal(err)
	}
	select {
	case <-slow.aborted:
	case <-time.After(2 * time.Second):
		t.Fatal("server ctx was not cancelled")
	}
}

// ---------------------------------------------------------------- errors

var validID = regexp.MustCompile(`^A-\d+$`)

type errorServer struct {
	shopv1.UnimplementedOrderServiceServer
	repo repo
}

func (s *errorServer) GetOrder(ctx context.Context, req *shopv1.GetOrderRequest) (*shopv1.Order, error) {
	if !validID.MatchString(req.GetOrderId()) {
		st, _ := status.New(codes.InvalidArgument, "invalid order_id").WithDetails(&errdetails.BadRequest{
			FieldViolations: []*errdetails.BadRequest_FieldViolation{
				{Field: "order_id", Description: "must match A-\\d+"},
			},
		})
		return nil, st.Err()
	}
	order, err := s.repo.Find(ctx, req.GetOrderId())
	if errors.Is(err, sql.ErrNoRows) {
		return nil, status.Errorf(codes.NotFound, "order %s not found", req.GetOrderId())
	}
	if err != nil {
		return nil, status.Error(codes.Unavailable, "database unavailable")
	}
	return order, nil
}

func TestErrors(t *testing.T) {
	s := grpc.NewServer()
	shopv1.RegisterOrderServiceServer(s, &errorServer{})
	client := dial(t, serve(t, s))
	ctx := context.Background()
	var notFound bool
	var invalid []string
	showNotFound := func() { notFound = true }
	markInvalid := func(f, d string) { invalid = append(invalid, f+": "+d) }

	for _, id := range []string{"A-9999", "oops"} {
		req := &shopv1.GetOrderRequest{OrderId: id}
		order, err := client.GetOrder(ctx, req)
		_ = order
		if err != nil {
			st := status.Convert(err)
			switch st.Code() {
			case codes.NotFound:
				showNotFound()
			case codes.InvalidArgument:
				for _, d := range st.Details() {
					if br, ok := d.(*errdetails.BadRequest); ok {
						for _, v := range br.GetFieldViolations() {
							markInvalid(v.GetField(), v.GetDescription())
						}
					}
				}
			default:
				log.Printf("GetOrder: %s: %s", st.Code(), st.Message())
			}
		}
	}
	if !notFound || len(invalid) != 1 || invalid[0] != `order_id: must match A-\d+` {
		t.Fatal(notFound, invalid)
	}
}

// ---------------------------------------------------------------- interceptors

func logging(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
	start := time.Now()
	resp, err := handler(ctx, req)
	log.Printf("%s %s %v", info.FullMethod, status.Code(err), time.Since(start))
	return resp, err
}

type userKey struct{}

func verifyJWT(tok string) (string, error) {
	if tok == "good" {
		return "C-42", nil
	}
	return "", errors.New("bad token")
}

func auth(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
	md, _ := metadata.FromIncomingContext(ctx)
	tokens := md.Get("authorization")
	if len(tokens) == 0 {
		return nil, status.Error(codes.Unauthenticated, "missing token")
	}
	user, err := verifyJWT(strings.TrimPrefix(tokens[0], "Bearer "))
	if err != nil {
		return nil, status.Error(codes.Unauthenticated, "invalid token")
	}
	return handler(context.WithValue(ctx, userKey{}, user), req)
}

func streamLogging(srv any, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
	return handler(srv, ss)
}

func TestInterceptors(t *testing.T) {
	s := grpc.NewServer(
		grpc.ChainUnaryInterceptor(logging, auth),   // outermost first
		grpc.ChainStreamInterceptor(streamLogging), // streams have their own interceptor type
	)
	shopv1.RegisterOrderServiceServer(s, &orderServer{})
	addr := serve(t, s)

	if _, err := dial(t, addr).GetOrder(context.Background(), &shopv1.GetOrderRequest{OrderId: "A-1"}); status.Code(err) != codes.Unauthenticated {
		t.Fatal(err)
	}

	creds := insecure.NewCredentials()
	token := func() string { return "good" }
	conn, err := grpc.NewClient(addr,
		grpc.WithTransportCredentials(creds),
		grpc.WithUnaryInterceptor(func(ctx context.Context, method string, req, reply any,
			cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption) error {
			ctx = metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+token())
			return invoker(ctx, method, req, reply, cc, opts...)
		}),
	)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if _, err := shopv1.NewOrderServiceClient(conn).GetOrder(context.Background(), &shopv1.GetOrderRequest{OrderId: "A-1"}); err != nil {
		t.Fatal(err)
	}
}

// ---------------------------------------------------------------- retries + keepalive

type flakyServer struct {
	shopv1.UnimplementedOrderServiceServer
	calls atomic.Int32
}

func (f *flakyServer) GetOrder(ctx context.Context, req *shopv1.GetOrderRequest) (*shopv1.Order, error) {
	if f.calls.Add(1) <= 2 {
		return nil, status.Error(codes.Unavailable, "connection to database lost")
	}
	return &shopv1.Order{Id: req.GetOrderId()}, nil
}

const serviceConfig = `{
  "methodConfig": [{
    "name": [{"service": "shop.v1.OrderService", "method": "GetOrder"}],
    "retryPolicy": {
      "maxAttempts": 4,
      "initialBackoff": "0.5s",
      "maxBackoff": "5s",
      "backoffMultiplier": 2,
      "retryableStatusCodes": ["UNAVAILABLE"]
    }
  }]
}`

func TestRetriesKeepalive(t *testing.T) {
	flaky := &flakyServer{}
	s := grpc.NewServer(
		grpc.KeepaliveEnforcementPolicy(keepalive.EnforcementPolicy{
			MinTime:             20 * time.Second,
			PermitWithoutStream: true,
		}),
	)
	shopv1.RegisterOrderServiceServer(s, flaky)
	addr := serve(t, s)
	creds := insecure.NewCredentials()

	conn, err := grpc.NewClient(addr,
		grpc.WithTransportCredentials(creds),
		grpc.WithDefaultServiceConfig(serviceConfig),
		grpc.WithKeepaliveParams(keepalive.ClientParameters{
			Time:                30 * time.Second, // ping after 30s of inactivity
			Timeout:             10 * time.Second, // dead if no ACK within 10s
			PermitWithoutStream: true,             // ping even when no RPC is active
		}),
	)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := shopv1.NewOrderServiceClient(conn).GetOrder(ctx, &shopv1.GetOrderRequest{OrderId: "A-1"}); err != nil {
		t.Fatal(err)
	}
	if flaky.calls.Load() != 3 {
		t.Fatal("calls:", flaky.calls.Load())
	}
}

// ---------------------------------------------------------------- load balancing

func TestLoadBalancing(t *testing.T) {
	s := grpc.NewServer()
	shopv1.RegisterOrderServiceServer(s, &orderServer{})
	addr := serve(t, s)
	_, port, _ := net.SplitHostPort(addr)
	creds := insecure.NewCredentials()

	conn, err := grpc.NewClient("dns:///localhost:"+port,
		grpc.WithTransportCredentials(creds),
		grpc.WithDefaultServiceConfig(`{"loadBalancingConfig": [{"round_robin": {}}]}`),
	)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := shopv1.NewOrderServiceClient(conn).GetOrder(ctx, &shopv1.GetOrderRequest{OrderId: "A-1"}); err != nil {
		t.Fatal(err)
	}
}

// ---------------------------------------------------------------- health + reflection

func TestHealthReflection(t *testing.T) {
	s := grpc.NewServer()
	shopv1.RegisterOrderServiceServer(s, &orderServer{})

	hs := health.NewServer()
	healthpb.RegisterHealthServer(s, hs)
	hs.SetServingStatus("shop.v1.OrderService", healthpb.HealthCheckResponse_SERVING)

	reflection.Register(s) // consider enabling only outside production
	addr := serve(t, s)

	conn, _ := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	defer conn.Close()
	ctx := context.Background()
	h := healthpb.NewHealthClient(conn)
	r, err := h.Check(ctx, &healthpb.HealthCheckRequest{Service: "shop.v1.OrderService"})
	if err != nil || r.GetStatus() != healthpb.HealthCheckResponse_SERVING {
		t.Fatal(err, r)
	}
	hs.SetServingStatus("shop.v1.OrderService", healthpb.HealthCheckResponse_NOT_SERVING)
	r, _ = h.Check(ctx, &healthpb.HealthCheckRequest{Service: "shop.v1.OrderService"})
	if r.GetStatus() != healthpb.HealthCheckResponse_NOT_SERVING {
		t.Fatal(r)
	}

	rs, err := reflectionpb.NewServerReflectionClient(conn).ServerReflectionInfo(ctx)
	if err != nil {
		t.Fatal(err)
	}
	rs.Send(&reflectionpb.ServerReflectionRequest{MessageRequest: &reflectionpb.ServerReflectionRequest_ListServices{}})
	resp, err := rs.Recv()
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, sv := range resp.GetListServicesResponse().GetService() {
		names = append(names, sv.GetName())
	}
	if !strings.Contains(strings.Join(names, ","), "shop.v1.OrderService") {
		t.Fatal(names)
	}
}

// ---------------------------------------------------------------- TLS

func loadPool(path string) *x509.CertPool {
	pem, _ := os.ReadFile(path)
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(pem)
	return pool
}

type tlsServer struct {
	orderServer
	caller string
}

func (s *tlsServer) GetOrder(ctx context.Context, req *shopv1.GetOrderRequest) (*shopv1.Order, error) {
	p, _ := peer.FromContext(ctx)
	tlsInfo := p.AuthInfo.(credentials.TLSInfo)
	caller := tlsInfo.State.PeerCertificates[0].Subject.CommonName // "checkout-service"
	s.caller = caller
	return s.orderServer.GetOrder(ctx, req)
}

func TestMTLS(t *testing.T) {
	if err := os.Chdir("../certs"); err != nil {
		t.Fatal(err)
	}
	defer os.Chdir("../go")

	cert, _ := tls.LoadX509KeyPair("orders.crt", "orders.key")
	serverCreds := credentials.NewTLS(&tls.Config{
		Certificates: []tls.Certificate{cert},
		ClientCAs:    loadPool("ca.crt"),
		ClientAuth:   tls.RequireAndVerifyClientCert, // drop this line for plain TLS
		MinVersion:   tls.VersionTLS13,
	})
	s := grpc.NewServer(grpc.Creds(serverCreds))
	impl := &tlsServer{}
	shopv1.RegisterOrderServiceServer(s, impl)
	addr := serve(t, s)

	clientCert, _ := tls.LoadX509KeyPair("checkout.crt", "checkout.key")
	clientCreds := credentials.NewTLS(&tls.Config{
		Certificates: []tls.Certificate{clientCert}, // omit for plain TLS
		RootCAs:      loadPool("ca.crt"),
		ServerName:   "orders.internal",
	})
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(clientCreds))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := shopv1.NewOrderServiceClient(conn).GetOrder(ctx, &shopv1.GetOrderRequest{OrderId: "A-1"}); err != nil {
		t.Fatal(err)
	}
	if impl.caller != "checkout-service" {
		t.Fatal(impl.caller)
	}
}
