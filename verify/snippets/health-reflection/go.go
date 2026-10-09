import (
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
)

s := grpc.NewServer()
shopv1.RegisterOrderServiceServer(s, &orderServer{})

hs := health.NewServer()
healthpb.RegisterHealthServer(s, hs)
hs.SetServingStatus("shop.v1.OrderService", healthpb.HealthCheckResponse_SERVING)

reflection.Register(s) // consider enabling only outside production

// Later, when a dependency fails:
hs.SetServingStatus("shop.v1.OrderService", healthpb.HealthCheckResponse_NOT_SERVING)
