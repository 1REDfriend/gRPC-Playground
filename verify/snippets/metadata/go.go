import "google.golang.org/grpc/metadata"

// ---- Client: attach metadata, read header + trailer back
ctx = metadata.AppendToOutgoingContext(ctx,
	"authorization", "Bearer "+token,
	"x-request-id", reqID,
)
var header, trailer metadata.MD
order, err := client.GetOrder(ctx, req, grpc.Header(&header), grpc.Trailer(&trailer))
log.Println(header.Get("x-served-by"), trailer.Get("x-db-time-ms"))

// ---- Server: read incoming metadata, send header + trailer
func (s *orderServer) GetOrder(ctx context.Context, req *shopv1.GetOrderRequest) (*shopv1.Order, error) {
	md, _ := metadata.FromIncomingContext(ctx)
	auth := md.Get("authorization") // []string, keys are always lowercase

	grpc.SetHeader(ctx, metadata.Pairs("x-served-by", hostname))
	start := time.Now()
	order, err := s.repo.Find(ctx, req.GetOrderId(), auth)
	grpc.SetTrailer(ctx, metadata.Pairs("x-db-time-ms", strconv.FormatInt(time.Since(start).Milliseconds(), 10)))
	return order, err
}
