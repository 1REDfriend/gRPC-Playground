// Server
public override async Task WatchOrder(
    WatchOrderRequest request,
    IServerStreamWriter<OrderEvent> responseStream,
    ServerCallContext context)
{
    await foreach (var ev in _tracker.FollowAsync(request.OrderId, context.CancellationToken))
    {
        await responseStream.WriteAsync(new OrderEvent { Status = ev.Status, Note = ev.Note });
    }
    // returning from the method sends grpc-status 0
}

// Client
using Grpc.Core;

using var call = client.WatchOrder(new WatchOrderRequest { OrderId = "A-1001" });
await foreach (var ev in call.ResponseStream.ReadAllAsync())
{
    Console.WriteLine($"{ev.Status}: {ev.Note}");
}
