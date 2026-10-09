// Server: Services/OrderServiceImpl.cs
using Grpc.Core;
using Shop.V1;

public class OrderServiceImpl : OrderService.OrderServiceBase
{
    public override Task<Order> GetOrder(GetOrderRequest request, ServerCallContext context)
    {
        if (string.IsNullOrEmpty(request.OrderId))
            throw new RpcException(new Status(StatusCode.InvalidArgument, "order_id is required"));

        return Task.FromResult(new Order
        {
            Id = request.OrderId,
            CustomerId = "C-42",
            TotalCents = 5970,
            Status = OrderStatus.Paid,
        });
    }
}

// Server: Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddGrpc();
var app = builder.Build();
app.MapGrpcService<OrderServiceImpl>();
app.Run();

// Client
using Grpc.Net.Client;
using Shop.V1;

using var channel = GrpcChannel.ForAddress("https://localhost:5001");
var client = new OrderService.OrderServiceClient(channel);

var order = await client.GetOrderAsync(
    new GetOrderRequest { OrderId = "A-1001" },
    deadline: DateTime.UtcNow.AddSeconds(2));

Console.WriteLine($"order {order.Id} is {order.Status}");
