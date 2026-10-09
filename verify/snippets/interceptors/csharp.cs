using Grpc.Core;
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
app.MapGrpcService<OrderServiceImpl>().RequireAuthorization();
