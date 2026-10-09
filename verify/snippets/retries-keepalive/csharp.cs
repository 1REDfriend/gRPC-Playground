using Grpc.Core;
using Grpc.Net.Client;
using Grpc.Net.Client.Configuration;

var retry = new MethodConfig
{
    Names = { new MethodName { Service = "shop.v1.OrderService", Method = "GetOrder" } },
    RetryPolicy = new RetryPolicy
    {
        MaxAttempts = 4,
        InitialBackoff = TimeSpan.FromSeconds(0.5),
        MaxBackoff = TimeSpan.FromSeconds(5),
        BackoffMultiplier = 2,
        RetryableStatusCodes = { StatusCode.Unavailable },
    },
};

var channel = GrpcChannel.ForAddress("https://orders.internal:5001", new GrpcChannelOptions
{
    ServiceConfig = new ServiceConfig { MethodConfigs = { retry } },
    HttpHandler = new SocketsHttpHandler
    {
        KeepAlivePingDelay = TimeSpan.FromSeconds(30),
        KeepAlivePingTimeout = TimeSpan.FromSeconds(10),
        KeepAlivePingPolicy = HttpKeepAlivePingPolicy.Always,
        EnableMultipleHttp2Connections = true,
    },
});
