// ---- Server: throw RpcException
public override async Task<Order> GetOrder(GetOrderRequest request, ServerCallContext context)
{
    if (!ValidId.IsMatch(request.OrderId))
        throw new RpcException(new Status(StatusCode.InvalidArgument, "order_id must match A-\\d+"));

    var order = await _repo.FindAsync(request.OrderId, context.CancellationToken);
    return order ?? throw new RpcException(
        new Status(StatusCode.NotFound, $"order {request.OrderId} not found"));
}
// For google.rpc.Status details, add the Grpc.StatusProto package and use
// new Google.Rpc.Status { ... }.ToRpcException().

// ---- Client
try
{
    var order = await client.GetOrderAsync(new GetOrderRequest { OrderId = "A-9999" });
}
catch (RpcException ex) when (ex.StatusCode == StatusCode.NotFound)
{
    ShowNotFound();
}
catch (RpcException ex)
{
    Console.WriteLine($"{ex.StatusCode}: {ex.Status.Detail}");
}
