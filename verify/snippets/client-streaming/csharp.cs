// Server
public override async Task<UploadSummary> UploadItems(
    IAsyncStreamReader<Item> requestStream, ServerCallContext context)
{
    var summary = new UploadSummary();
    await foreach (var item in requestStream.ReadAllAsync(context.CancellationToken))
    {
        summary.ItemCount++;
        summary.TotalCents += item.Quantity * item.PriceCents;
    }
    return summary;
}

// Client
using var call = client.UploadItems();
foreach (var item in cart)
{
    await call.RequestStream.WriteAsync(item);
}
await call.RequestStream.CompleteAsync(); // half-close

var summary = await call; // or: await call.ResponseAsync
Console.WriteLine($"uploaded {summary.ItemCount} items, total {summary.TotalCents}");
