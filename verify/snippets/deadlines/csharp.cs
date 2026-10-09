// ---- Client
using var cts = new CancellationTokenSource();
cancelButton.Click += (_, _) => cts.Cancel();   // -> StatusCode.Cancelled

try
{
    var order = await client.GetOrderAsync(
        new GetOrderRequest { OrderId = "A-1001" },
        deadline: DateTime.UtcNow.AddMilliseconds(1500),
        cancellationToken: cts.Token);
}
catch (RpcException ex) when (ex.StatusCode == StatusCode.DeadlineExceeded)
{
    ShowCachedOrder();
}

// ---- Server: context.CancellationToken fires on deadline or client cancel
public override async Task<Order> GetOrder(GetOrderRequest request, ServerCallContext context)
{
    Console.WriteLine($"time left: {context.Deadline - DateTime.UtcNow}");
    return await _repo.FindAsync(request.OrderId, context.CancellationToken);
}
