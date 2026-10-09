import type { SimEvent, TopicModule } from '../../../lib/types';
import { CLIENT, l } from '../../shared';

const HOP = 520;

const topic: TopicModule = {
  slug: 'interceptors',
  sim: {
    controls: [
      {
        kind: 'select',
        id: 'token',
        label: l('token ที่ client ส่งมา', 'Token sent by the client'),
        default: 'valid',
        options: [
          { value: 'valid', label: l('ถูกต้อง', 'Valid') },
          { value: 'missing', label: l('ไม่มี token', 'Missing') },
        ],
      },
    ],
    build: (p) => {
      const ok = p.token === 'valid';
      const actors = [
        CLIENT,
        { id: 'log', label: l('Logging', 'Logging') },
        { id: 'auth', label: l('Auth', 'Auth') },
        { id: 'handler', label: l('Handler', 'Handler') },
      ];
      const events: SimEvent[] = [
        {
          at: 0,
          from: 'client',
          to: 'log',
          kind: 'headers',
          label: ok ? 'GetOrder + authorization' : 'GetOrder (no token)',
          detail: ok ? ':path = /shop.v1.OrderService/GetOrder\nauthorization = Bearer eyJhbGciOi...' : ':path = /shop.v1.OrderService/GetOrder\n(no authorization header)',
          note: l('ทุก call ผ่าน interceptor ตามลำดับที่ลงทะเบียนไว้', 'Every call passes through interceptors in registration order.'),
        },
        {
          at: HOP,
          from: 'log',
          to: 'log',
          kind: 'note',
          label: 'start=now(); log "→ GetOrder"',
          note: l('Logging จดเวลาเริ่ม แล้วเรียก next()', 'Logging records the start time, then calls next().'),
        },
        { at: HOP + 250, from: 'log', to: 'auth', kind: 'headers', label: 'next(ctx, req)' },
      ];
      if (ok) {
        events.push(
          {
            at: HOP * 2 + 250,
            from: 'auth',
            to: 'auth',
            kind: 'note',
            label: 'verify JWT → user=C-42',
            note: l('Auth ตรวจ token แล้วใส่ข้อมูล user ลงใน context', 'Auth verifies the token and puts the user into the context.'),
          },
          { at: HOP * 2 + 500, from: 'auth', to: 'handler', kind: 'headers', label: 'next(ctx{user}, req)' },
          {
            at: HOP * 3 + 500,
            from: 'handler',
            to: 'handler',
            kind: 'note',
            label: 'GetOrder(ctx, req) → Order',
            note: l('handler โฟกัสแค่ business logic ไม่ต้องรู้เรื่อง auth หรือ log', 'The handler only does business logic. It knows nothing about auth or logging.'),
          },
          { at: HOP * 3 + 800, from: 'handler', to: 'auth', kind: 'data', label: 'return Order, nil' },
          { at: HOP * 4 + 800, from: 'auth', to: 'log', kind: 'data', label: 'return Order, nil' },
          {
            at: HOP * 5 + 800,
            from: 'log',
            to: 'log',
            kind: 'note',
            label: 'log "← GetOrder OK 14ms"',
            note: l('ขากลับผ่าน interceptor เดิมในลำดับย้อนกลับ', 'On the way back, the same interceptors run in reverse.'),
          },
          { at: HOP * 5 + 1050, from: 'log', to: 'client', kind: 'trailers', label: 'Order + grpc-status 0', detail: 'grpc-status = 0' },
        );
      } else {
        events.push(
          {
            at: HOP * 2 + 250,
            from: 'auth',
            to: 'auth',
            kind: 'error',
            label: 'no token → UNAUTHENTICATED',
            note: l('Auth ตัดจบตรงนี้ ไม่เรียก next()', 'Auth stops here and never calls next().'),
          },
          { at: HOP * 2 + 500, from: 'auth', to: 'log', kind: 'error', label: 'return nil, UNAUTHENTICATED' },
          {
            at: HOP * 3 + 500,
            from: 'log',
            to: 'log',
            kind: 'note',
            label: 'log "← GetOrder UNAUTHENTICATED 1ms"',
            note: l('Logging ยังได้บันทึก เพราะอยู่ชั้นนอกสุด', 'Logging still records it because it is the outermost layer.'),
          },
          { at: HOP * 3 + 750, from: 'log', to: 'client', kind: 'error', label: 'grpc-status 16', detail: 'grpc-status = 16\ngrpc-message = missing token' },
        );
      }
      return {
        actors,
        events,
        outcome: ok
          ? { ok: true, text: l('ผ่านครบทุกชั้น handler ได้ทำงาน', 'Passed every layer; the handler ran.') }
          : { ok: false, text: l('UNAUTHENTICATED: handler ไม่ถูกเรียกเลย', 'UNAUTHENTICATED: the handler never ran.') },
      };
    },
  },
  code: [
    {
      id: 'go',
      lang: 'go',
      code: `// A unary server interceptor wraps the handler: do work before, call handler, do work after.
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
)`,
    },
    {
      id: 'node',
      lang: 'typescript',
      code: `// ---- Client interceptor: add a token to every call
const authInterceptor: grpc.Interceptor = (options, nextCall) =>
  new grpc.InterceptingCall(nextCall(options), {
    start(metadata, listener, next) {
      metadata.set('authorization', \`Bearer \${getToken()}\`);
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
      console.log(\`\${methodDescriptor.path} \${grpc.status[status.code]} \${Date.now() - start}ms\`);
      next(status);
    },
  });
};

const server = new grpc.Server({ interceptors: [loggingInterceptor] });`,
    },
    {
      id: 'python',
      lang: 'python',
      code: `import grpc


class LoggingInterceptor(grpc.ServerInterceptor):
    # intercept_service runs before the handler is chosen; to time the handler itself,
    # wrap handler.unary_unary in your own function.
    def intercept_service(self, continuation, handler_call_details):
        print(f"-> {handler_call_details.method}")
        return continuation(handler_call_details)


def _deny(request, context):
    context.abort(grpc.StatusCode.UNAUTHENTICATED, "missing token")


class AuthInterceptor(grpc.ServerInterceptor):
    def intercept_service(self, continuation, handler_call_details):
        md = dict(handler_call_details.invocation_metadata)
        if not md.get("authorization", "").startswith("Bearer "):
            return grpc.unary_unary_rpc_method_handler(_deny)  # short-circuit
        return continuation(handler_call_details)


server = grpc.server(
    futures.ThreadPoolExecutor(max_workers=10),
    interceptors=[LoggingInterceptor(), AuthInterceptor()],  # outermost first
)`,
    },
    {
      id: 'csharp',
      lang: 'csharp',
      code: `using Grpc.Core;
using Grpc.Core.Interceptors;

public class LoggingInterceptor(ILogger<LoggingInterceptor> logger) : Interceptor
{
    public override async Task<TResponse> UnaryServerHandler<TRequest, TResponse>(
        TRequest request,
        ServerCallContext context,
        UnaryServerMethod<TRequest, TResponse> continuation)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            return await continuation(request, context);
        }
        finally
        {
            logger.LogInformation("{Method} {Status} {Ms}ms",
                context.Method, context.Status.StatusCode, sw.ElapsedMilliseconds);
        }
    }
}

// Program.cs
builder.Services.AddGrpc(options =>
{
    options.Interceptors.Add<LoggingInterceptor>();
});

// For auth, ASP.NET Core's own middleware usually does the job:
builder.Services.AddAuthentication().AddJwtBearer();
builder.Services.AddAuthorization();
app.UseAuthentication();
app.UseAuthorization();
app.MapGrpcService<OrderServiceImpl>().RequireAuthorization();`,
    },
  ],
};

export default topic;
