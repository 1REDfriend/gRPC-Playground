using Grpc.Core;
using Grpc.Net.Client;
using Grpc.Net.Client.Configuration;

var channel = GrpcChannel.ForAddress("dns:///orders.internal:5001", new GrpcChannelOptions
{
    Credentials = ChannelCredentials.SecureSsl,
    ServiceConfig = new ServiceConfig { LoadBalancingConfigs = { new RoundRobinConfig() } },
});
