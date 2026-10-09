// A unary server interceptor wraps the handler: do work before, call handler, do work after.
func logging(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
	start := time.Now()
	resp, err := handler(ctx, req)
	log.Printf("%s %s %v", info.FullMethod, status.Code(err), time.Since(start))
	return resp, err
}

type userKey struct{}

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

s := grpc.NewServer(
	grpc.ChainUnaryInterceptor(logging, auth),   // outermost first
	grpc.ChainStreamInterceptor(streamLogging), // streams have their own interceptor type
)

// Client side works the same way, e.g. to attach a token to every call:
conn, err := grpc.NewClient(addr,
	grpc.WithTransportCredentials(creds),
	grpc.WithUnaryInterceptor(func(ctx context.Context, method string, req, reply any,
		cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption) error {
		ctx = metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+token())
		return invoker(ctx, method, req, reply, cc, opts...)
	}),
)
