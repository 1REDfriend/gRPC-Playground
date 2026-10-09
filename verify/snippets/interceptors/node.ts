// ---- Client interceptor: add a token to every call
const authInterceptor: grpc.Interceptor = (options, nextCall) =>
  new grpc.InterceptingCall(nextCall(options), {
    start(metadata, listener, next) {
      metadata.set('authorization', `Bearer ${getToken()}`);
      next(metadata, listener);
    },
  });

const client = new shop.OrderService(addr, grpc.credentials.createInsecure(), {
  interceptors: [authInterceptor],
});

// ---- Server interceptor (@grpc/grpc-js >= 1.10)
const loggingInterceptor: grpc.ServerInterceptor = (methodDescriptor, call) => {
  const start = Date.now();
  return new grpc.ServerInterceptingCall(call, {
    sendStatus(status, next) {
      console.log(`${methodDescriptor.path} ${grpc.status[status.code]} ${Date.now() - start}ms`);
      next(status);
    },
  });
};

const server = new grpc.Server({ interceptors: [loggingInterceptor] });
