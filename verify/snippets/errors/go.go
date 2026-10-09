import (
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// ---- Server
func (s *orderServer) GetOrder(ctx context.Context, req *shopv1.GetOrderRequest) (*shopv1.Order, error) {
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

// ---- Client
order, err := client.GetOrder(ctx, req)
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
