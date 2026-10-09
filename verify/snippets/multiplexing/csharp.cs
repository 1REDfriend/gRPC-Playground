// Create the channel once (e.g. register as a singleton) and reuse it.
var channel = GrpcChannel.ForAddress("https://orders.internal:5001", new GrpcChannelOptions
{
    HttpHandler = new SocketsHttpHandler
    {
        // Open extra connections when one hits the server's concurrent-stream limit (often 100)
        EnableMultipleHttp2Connections = true,
    },
});
var client = new OrderService.OrderServiceClient(channel);

var ids = new[] { "A-1001", "A-1002", "A-1003" };
var orders = await Task.WhenAll(ids.Select(id =>
    client.GetOrderAsync(new GetOrderRequest { OrderId = id }).ResponseAsync));

Console.WriteLine(string.Join(", ", orders.Select(o => o.Status)));
