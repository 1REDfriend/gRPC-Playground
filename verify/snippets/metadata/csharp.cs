// ---- Client
var headers = new Metadata
{
    { "authorization", $"Bearer {token}" },
    { "x-request-id", reqId },
};
using var call = client.GetOrderAsync(new GetOrderRequest { OrderId = "A-1001" }, headers);

var responseHeaders = await call.ResponseHeadersAsync;
var order = await call.ResponseAsync;
var trailers = call.GetTrailers();
Console.WriteLine(responseHeaders.GetValue("x-served-by"));
Console.WriteLine(trailers.GetValue("x-db-time-ms"));

// ---- Server
public override async Task<Order> GetOrder(GetOrderRequest request, ServerCallContext context)
{
    var auth = context.RequestHeaders.GetValue("authorization");

    await context.WriteResponseHeadersAsync(new Metadata { { "x-served-by", Environment.MachineName } });
    var order = await _repo.FindAsync(request.OrderId, auth);
    context.ResponseTrailers.Add("x-db-time-ms", "12");
    return order;
}
