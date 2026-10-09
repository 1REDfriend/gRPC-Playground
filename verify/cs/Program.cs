// Runs the C# snippets from the site against real in-process ASP.NET Core servers.
// Service bodies and client code are copied from the snippets; only stubs and wiring are added.
using System.Diagnostics;
using System.Net;
using System.Security.Cryptography.X509Certificates;
using System.Text.RegularExpressions;
using Google.Protobuf;
using Grpc.Core;
using Grpc.Health.V1;
using Grpc.Net.Client;
using Grpc.Net.Client.Configuration;
using Grpc.Net.Client.Web;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.AspNetCore.Server.Kestrel.Https;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Shop.V1;

var results = new List<(string Name, bool Ok, string Detail)>();
async Task Check(string name, Func<Task> body)
{
    try { await body(); results.Add((name, true, "")); }
    catch (Exception e) { results.Add((name, false, e.ToString())); }
}
static void Assert(bool cond, string msg = "assertion failed") { if (!cond) throw new Exception(msg); }

// Starts a gRPC server on a random loopback port (HTTP/2 without TLS unless configured otherwise).
static async Task<(WebApplication App, string Url)> Start(
    Action<WebApplicationBuilder> services, Action<WebApplication> map, bool tls = false, HttpProtocols protocols = HttpProtocols.Http2)
{
    var builder = WebApplication.CreateBuilder();
    builder.Logging.SetMinimumLevel(LogLevel.Warning);
    services(builder); // first, so snippet settings such as ConfigureHttpsDefaults apply to our endpoint
    builder.WebHost.ConfigureKestrel(k => k.Listen(IPAddress.Loopback, 0, o =>
    {
        o.Protocols = protocols;
        if (tls) o.UseHttps();
    }));
    var app = builder.Build();
    map(app);
    await app.StartAsync();
    var url = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
    return (app, url);
}

var certs = Path.GetFullPath("../certs");

// ------------------------------------------------------------------ protobuf
await Check("protobuf: ToByteArray / ParseFrom / JSON", async () =>
{
    var item = new Item { Sku = "SKU-1007", Quantity = 150 };

    byte[] data = item.ToByteArray();
    Console.WriteLine(Convert.ToHexString(data));
    Assert(Convert.ToHexString(data) == "0A08534B552D31303037109601");

    var decoded = Item.Parser.ParseFrom(data);
    Console.WriteLine($"{decoded.Sku} x{decoded.Quantity}");

    Console.WriteLine(JsonFormatter.Default.Format(decoded));
    Assert(JsonFormatter.Default.Format(decoded).Contains("\"sku\": \"SKU-1007\""));
});

// ------------------------------------------------------------------ unary
await Check("unary: GetOrderAsync + InvalidArgument", async () =>
{
    var (app, url) = await Start(b => b.Services.AddGrpc(), a => a.MapGrpcService<OrderServiceImpl>());

    using var channel = GrpcChannel.ForAddress(url);
    var client = new OrderService.OrderServiceClient(channel);

    var order = await client.GetOrderAsync(
        new GetOrderRequest { OrderId = "A-1001" },
        deadline: DateTime.UtcNow.AddSeconds(2));

    Console.WriteLine($"order {order.Id} is {order.Status}");
    Assert(order.Status == OrderStatus.Paid);
    try { await client.GetOrderAsync(new GetOrderRequest()); Assert(false, "expected error"); }
    catch (RpcException ex) { Assert(ex.StatusCode == StatusCode.InvalidArgument, ex.StatusCode.ToString()); }
    await app.StopAsync();
});

// ------------------------------------------------------------------ streaming
await Check("server streaming: WatchOrder", async () =>
{
    var (app, url) = await Start(b => b.Services.AddGrpc(), a => a.MapGrpcService<StreamingService>());
    using var channel = GrpcChannel.ForAddress(url);
    var client = new OrderService.OrderServiceClient(channel);
    var got = new List<string>();

    using var call = client.WatchOrder(new WatchOrderRequest { OrderId = "A-1001" });
    await foreach (var ev in call.ResponseStream.ReadAllAsync())
    {
        Console.WriteLine($"{ev.Status}: {ev.Note}");
        got.Add(ev.Status.ToString());
    }
    Assert(string.Join(",", got) == "Pending,Paid,Shipped,Delivered", string.Join(",", got));
    await app.StopAsync();
});

await Check("client streaming: UploadItems", async () =>
{
    var (app, url) = await Start(b => b.Services.AddGrpc(), a => a.MapGrpcService<StreamingService>());
    using var channel = GrpcChannel.ForAddress(url);
    var client = new OrderService.OrderServiceClient(channel);
    var cart = new[] { new Item { Sku = "SKU-1", Quantity = 2, PriceCents = 100 }, new Item { Sku = "SKU-2", Quantity = 1, PriceCents = 250 } };

    using var call = client.UploadItems();
    foreach (var item in cart)
    {
        await call.RequestStream.WriteAsync(item);
    }
    await call.RequestStream.CompleteAsync(); // half-close

    var summary = await call; // or: await call.ResponseAsync
    Console.WriteLine($"uploaded {summary.ItemCount} items, total {summary.TotalCents}");
    Assert(summary.ItemCount == 2 && summary.TotalCents == 450);
    await app.StopAsync();
});

await Check("bidi: SupportChat", async () =>
{
    var (app, url) = await Start(b => b.Services.AddGrpc(), a => a.MapGrpcService<StreamingService>());
    using var channel = GrpcChannel.ForAddress(url);
    var client = new OrderService.OrderServiceClient(channel);
    var got = new List<string>();

    using var call = client.SupportChat();

    var reader = Task.Run(async () =>
    {
        await foreach (var m in call.ResponseStream.ReadAllAsync())
            got.Add($"{m.From}: {m.Text}");
    });

    await call.RequestStream.WriteAsync(new ChatMessage { From = "C-42", Text = "Where is order A-1001?" });
    await call.RequestStream.WriteAsync(new ChatMessage { From = "C-42", Text = "Thanks!" });
    await call.RequestStream.CompleteAsync(); // half-close
    await reader;
    Assert(got.Count == 5 && got[4] == "bot: Have a nice day!", string.Join(" | ", got));
    await app.StopAsync();
});

// ------------------------------------------------------------------ multiplexing
await Check("multiplexing: Task.WhenAll on one channel", async () =>
{
    var (app, url) = await Start(b => b.Services.AddGrpc(), a => a.MapGrpcService<OrderServiceImpl>());

    var channel = GrpcChannel.ForAddress(url, new GrpcChannelOptions
    {
        HttpHandler = new SocketsHttpHandler
        {
            EnableMultipleHttp2Connections = true,
        },
    });
    var client = new OrderService.OrderServiceClient(channel);

    var ids = new[] { "A-1001", "A-1002", "A-1003" };
    var orders = await Task.WhenAll(ids.Select(id =>
        client.GetOrderAsync(new GetOrderRequest { OrderId = id }).ResponseAsync));

    Console.WriteLine(string.Join(", ", orders.Select(o => o.Status)));
    Assert(orders.All(o => o.Status == OrderStatus.Paid));
    channel.Dispose();
    await app.StopAsync();
});

// ------------------------------------------------------------------ metadata
await Check("metadata: headers + trailers", async () =>
{
    var (app, url) = await Start(b => b.Services.AddGrpc(), a => a.MapGrpcService<MetadataService>());
    using var channel = GrpcChannel.ForAddress(url);
    var client = new OrderService.OrderServiceClient(channel);
    var token = "t0k";
    var reqId = "7f3c9a";

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
    Assert(responseHeaders.GetValue("x-served-by") == Environment.MachineName);
    Assert(trailers.GetValue("x-db-time-ms") == "12" && order.CustomerId == "Bearer t0k");
    await app.StopAsync();
});

// ------------------------------------------------------------------ deadlines
await Check("deadlines: DeadlineExceeded + cancel", async () =>
{
    var (app, url) = await Start(b => b.Services.AddGrpc(), a => a.MapGrpcService<SlowService>());
    using var channel = GrpcChannel.ForAddress(url);
    var client = new OrderService.OrderServiceClient(channel);
    var cached = false;
    void ShowCachedOrder() => cached = true;

    {
        using var cts = new CancellationTokenSource();
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
    }
    Assert(cached, "deadline branch not hit");

    using var cts2 = new CancellationTokenSource(200); // stands in for cancelButton.Click
    try
    {
        await client.GetOrderAsync(new GetOrderRequest { OrderId = "A-1001" }, cancellationToken: cts2.Token);
        Assert(false, "expected cancel");
    }
    catch (RpcException ex) { Assert(ex.StatusCode == StatusCode.Cancelled, ex.StatusCode.ToString()); }
    await Task.Delay(300);
    Assert(SlowService.Aborted == 2, $"server aborted {SlowService.Aborted} times");
    await app.StopAsync();
});

// ------------------------------------------------------------------ errors
await Check("errors: NotFound / InvalidArgument / rich details", async () =>
{
    var (app, url) = await Start(b => b.Services.AddGrpc(), a => a.MapGrpcService<ErrorService>());
    using var channel = GrpcChannel.ForAddress(url);
    var client = new OrderService.OrderServiceClient(channel);
    var notFound = false;
    void ShowNotFound() => notFound = true;

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
    Assert(notFound);

    try { await client.GetOrderAsync(new GetOrderRequest { OrderId = "oops" }); }
    catch (RpcException ex)
    {
        Assert(ex.StatusCode == StatusCode.InvalidArgument && ex.Status.Detail == @"order_id must match A-\d+", ex.Status.Detail);
    }

    // The comment in the snippet mentions Grpc.StatusProto: check that path works too.
    var (app2, url2) = await Start(b => b.Services.AddGrpc(), a => a.MapGrpcService<RichErrorService>());
    using var channel2 = GrpcChannel.ForAddress(url2);
    try { await new OrderService.OrderServiceClient(channel2).GetOrderAsync(new GetOrderRequest()); }
    catch (RpcException ex)
    {
        var rich = ex.GetRpcStatus();
        var br = rich!.GetDetail<Google.Rpc.BadRequest>();
        Assert(br!.FieldViolations[0].Field == "order_id");
    }
    await app.StopAsync();
    await app2.StopAsync();
});

// ------------------------------------------------------------------ interceptors + auth
await Check("interceptors: LoggingInterceptor + RequireAuthorization", async () =>
{
    var (app, url) = await Start(builder =>
    {
        builder.Services.AddGrpc(options =>
        {
            options.Interceptors.Add<LoggingInterceptor>();
        });
        builder.Services.AddAuthentication().AddJwtBearer();
        builder.Services.AddAuthorization();
    }, app =>
    {
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGrpcService<OrderServiceImpl>().RequireAuthorization();
    });
    using var channel = GrpcChannel.ForAddress(url);
    try
    {
        await new OrderService.OrderServiceClient(channel).GetOrderAsync(new GetOrderRequest { OrderId = "A-1" });
        Assert(false, "expected Unauthenticated");
    }
    catch (RpcException ex) { Assert(ex.StatusCode == StatusCode.Unauthenticated, ex.StatusCode.ToString()); }

    var (app2, url2) = await Start(b => b.Services.AddGrpc(o => o.Interceptors.Add<LoggingInterceptor>()), a => a.MapGrpcService<OrderServiceImpl>());
    using var channel2 = GrpcChannel.ForAddress(url2);
    await new OrderService.OrderServiceClient(channel2).GetOrderAsync(new GetOrderRequest { OrderId = "A-1" });
    Assert(LoggingInterceptor.Calls == 1, $"interceptor calls: {LoggingInterceptor.Calls}");
    await app.StopAsync();
    await app2.StopAsync();
});

// ------------------------------------------------------------------ retries + keepalive
await Check("retries: MethodConfig RetryPolicy", async () =>
{
    var (app, url) = await Start(b => b.Services.AddGrpc(), a => a.MapGrpcService<FlakyService>());

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

    var channel = GrpcChannel.ForAddress(url, new GrpcChannelOptions
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
    var order = await new OrderService.OrderServiceClient(channel).GetOrderAsync(new GetOrderRequest { OrderId = "A-1" });
    Assert(order.Id == "A-1" && FlakyService.Calls == 3, $"calls={FlakyService.Calls}");
    channel.Dispose();
    await app.StopAsync();
});

// ------------------------------------------------------------------ load balancing
await Check("load balancing: dns:/// + RoundRobinConfig", async () =>
{
    var (app, url) = await Start(b => b.Services.AddGrpc(), a => a.MapGrpcService<OrderServiceImpl>());
    var port = new Uri(url).Port;

    var channel = GrpcChannel.ForAddress($"dns:///localhost:{port}", new GrpcChannelOptions
    {
        Credentials = ChannelCredentials.Insecure, // the site uses SecureSsl; this test server has no TLS
        ServiceConfig = new ServiceConfig { LoadBalancingConfigs = { new RoundRobinConfig() } },
    });
    var order = await new OrderService.OrderServiceClient(channel).GetOrderAsync(new GetOrderRequest { OrderId = "A-1" });
    Assert(order.Id == "A-1");
    channel.Dispose();
    await app.StopAsync();
});

// ------------------------------------------------------------------ health + reflection
await Check("health + reflection", async () =>
{
    var db = new FakeDb();
    var (app, url) = await Start(builder =>
    {
        builder.Services.AddGrpc();
        builder.Services.AddGrpcHealthChecks()
            .AddCheck("database", () => db.CanConnect()
                ? HealthCheckResult.Healthy()
                : HealthCheckResult.Unhealthy());
        builder.Services.AddGrpcReflection();
    }, app =>
    {
        app.MapGrpcService<OrderServiceImpl>();
        app.MapGrpcHealthChecksService();
        app.MapGrpcReflectionService();
    });
    using var channel = GrpcChannel.ForAddress(url);
    var health = new Health.HealthClient(channel);
    var r = await health.CheckAsync(new HealthCheckRequest { Service = "" });
    Assert(r.Status == HealthCheckResponse.Types.ServingStatus.Serving, r.Status.ToString());
    db.Up = false;
    await Task.Delay(TimeSpan.FromSeconds(6)); // health checks are re-evaluated on a timer
    r = await health.CheckAsync(new HealthCheckRequest { Service = "" });
    Assert(r.Status == HealthCheckResponse.Types.ServingStatus.NotServing, "after db down: " + r.Status);

    var refl = new Grpc.Reflection.V1Alpha.ServerReflection.ServerReflectionClient(channel);
    using var call = refl.ServerReflectionInfo();
    await call.RequestStream.WriteAsync(new Grpc.Reflection.V1Alpha.ServerReflectionRequest { ListServices = "" });
    await call.ResponseStream.MoveNext();
    var names = call.ResponseStream.Current.ListServicesResponse.Service.Select(s => s.Name).ToList();
    await call.RequestStream.CompleteAsync();
    Assert(names.Contains("shop.v1.OrderService"), string.Join(",", names));
    await app.StopAsync();
});

// ------------------------------------------------------------------ TLS / mTLS
await Check("tls: Kestrel mTLS + client certificate (LoadPem from the site)", RunMtls);

static bool TrustedByCa(X509Certificate cert, X509Certificate2 ca)
{
    using var chain = new X509Chain();
    chain.ChainPolicy.ExtraStore.Add(ca);
    chain.ChainPolicy.VerificationFlags = X509VerificationFlags.AllowUnknownCertificateAuthority;
    chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
    var ok = chain.Build(X509CertificateLoader.LoadCertificate(cert.GetRawCertData()))
             && chain.ChainElements[^1].Certificate.Thumbprint == ca.Thumbprint;
    if (!ok) Console.WriteLine("chain rejected: " + cert.Subject);
    return ok;
}

// Copied from the TLS snippet.
static X509Certificate2 LoadPem(string certPath, string keyPath)
{
    using var pem = X509Certificate2.CreateFromPemFile(certPath, keyPath);
    return X509CertificateLoader.LoadPkcs12(pem.Export(X509ContentType.Pkcs12), password: null);
}

async Task RunMtls()
{
    X509Certificate2 Load(string crt, string key) => LoadPem(Path.Combine(certs, crt), Path.Combine(certs, key));
    var ca = X509CertificateLoader.LoadCertificateFromFile(Path.Combine(certs, "ca.crt"));
    TlsService.Caller = null;

    var (app, url) = await Start(builder =>
    {
        builder.Services.AddGrpc();
        builder.WebHost.ConfigureKestrel(kestrel =>
        {
            kestrel.ConfigureHttpsDefaults(https =>
            {
                https.ServerCertificate = Load("orders.crt", "orders.key");
                https.ClientCertificateMode = ClientCertificateMode.RequireCertificate; // remove for plain TLS
                // Test-only: trust our private CA for client certs.
                https.ClientCertificateValidation = (cert, _, _) => TrustedByCa(cert, ca);
                https.CheckCertificateRevocation = false;
            });
        });
    }, a => a.MapGrpcService<TlsService>(), tls: true);

    var handler = new SocketsHttpHandler();
    handler.SslOptions.ClientCertificates = new X509CertificateCollection
    {
        Load("checkout.crt", "checkout.key"), // omit for plain TLS
    };
    // Test-only: trust our private CA for the server cert.
    handler.SslOptions.RemoteCertificateValidationCallback = (_, cert, _, _) => TrustedByCa(cert!, ca);
    var channel = GrpcChannel.ForAddress(url.Replace("127.0.0.1", "localhost"), new GrpcChannelOptions
    {
        HttpHandler = handler,
    });
    try
    {
        var order = await new OrderService.OrderServiceClient(channel).GetOrderAsync(new GetOrderRequest { OrderId = "A-1" });
        Assert(order.Id == "A-1" && TlsService.Caller == "checkout-service", $"caller={TlsService.Caller}");
    }
    finally
    {
        channel.Dispose();
        await app.StopAsync();
    }
}

// ------------------------------------------------------------------ gRPC-Web
await Check("grpc-web: UseGrpcWeb + EnableGrpcWeb + CORS", async () =>
{
    var (app, url) = await Start(builder =>
    {
        builder.Services.AddGrpc();
        builder.Services.AddCors(o => o.AddPolicy("web", p => p
            .WithOrigins("https://shop.example.com")
            .AllowAnyHeader()
            .WithMethods("POST", "OPTIONS")
            .WithExposedHeaders("Grpc-Status", "Grpc-Message", "Grpc-Encoding", "Grpc-Accept-Encoding")));
    }, app =>
    {
        app.UseGrpcWeb();
        app.UseCors();
        app.MapGrpcService<OrderServiceImpl>()
           .EnableGrpcWeb()
           .RequireCors("web");
    }, protocols: HttpProtocols.Http1AndHttp2);

    // gRPC-Web over HTTP/1.1, as a browser would send it
    using var channel = GrpcChannel.ForAddress(url, new GrpcChannelOptions
    {
        HttpHandler = new GrpcWebHandler(GrpcWebMode.GrpcWeb, new HttpClientHandler()),
        HttpVersion = HttpVersion.Version11,
    });
    var order = await new OrderService.OrderServiceClient(channel).GetOrderAsync(new GetOrderRequest { OrderId = "A-1" });
    Assert(order.Id == "A-1");

    using var http = new HttpClient();
    var pre = new HttpRequestMessage(HttpMethod.Options, url + "/shop.v1.OrderService/GetOrder");
    pre.Headers.Add("Origin", "https://shop.example.com");
    pre.Headers.Add("Access-Control-Request-Method", "POST");
    pre.Headers.Add("Access-Control-Request-Headers", "content-type,x-grpc-web");
    var resp = await http.SendAsync(pre);
    Assert(resp.Headers.TryGetValues("Access-Control-Allow-Origin", out var o) && o.First() == "https://shop.example.com", "preflight: " + resp.StatusCode);
    await app.StopAsync();
});

Console.WriteLine();
foreach (var (name, ok, detail) in results)
{
    Console.WriteLine($"[{(ok ? "PASS" : "FAIL")}] {name}");
    if (!ok) Console.WriteLine("       " + string.Join("\n       ", detail.Split('\n').Take(6)));
}
var failed = results.Count(r => !r.Ok);
Console.WriteLine($"\n{results.Count - failed}/{results.Count} passed");
return failed == 0 ? 0 : 1;

// ================================================================== services (bodies copied from the snippets)

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

public record Ev(OrderStatus Status, string Note);

public class Tracker
{
    public async IAsyncEnumerable<Ev> FollowAsync(string id, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        foreach (var s in new[] { OrderStatus.Pending, OrderStatus.Paid, OrderStatus.Shipped, OrderStatus.Delivered })
        {
            await Task.Delay(10, ct);
            yield return new Ev(s, s.ToString());
        }
    }
}

public class Bot
{
    public IEnumerable<string> Answer(string text) =>
        text.Contains("order") ? new[] { "Checking...", "Out for delivery" } : new[] { "You're welcome" };
}

public class StreamingService : OrderService.OrderServiceBase
{
    private readonly Tracker _tracker = new();
    private readonly Bot _bot = new();

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

    public override async Task SupportChat(
        IAsyncStreamReader<ChatMessage> requestStream,
        IServerStreamWriter<ChatMessage> responseStream,
        ServerCallContext context)
    {
        await responseStream.WriteAsync(new ChatMessage { From = "bot", Text = "Hi! How can I help?" });
        await foreach (var msg in requestStream.ReadAllAsync(context.CancellationToken))
        {
            foreach (var reply in _bot.Answer(msg.Text))
                await responseStream.WriteAsync(new ChatMessage { From = "bot", Text = reply });
        }
        await responseStream.WriteAsync(new ChatMessage { From = "bot", Text = "Have a nice day!" });
    }
}

public class Repo
{
    public Task<Order?> FindAsync(string id, string? auth) => Task.FromResult<Order?>(new Order { Id = id, CustomerId = auth ?? "" });

    public async Task<Order?> FindAsync(string id, CancellationToken ct)
    {
        if (id == "A-9999") return null;
        try { await Task.Delay(3000, ct); }
        catch (OperationCanceledException) { Interlocked.Increment(ref SlowService.Aborted); throw; }
        return new Order { Id = id };
    }
}

public class MetadataService : OrderService.OrderServiceBase
{
    private readonly Repo _repo = new();

    public override async Task<Order> GetOrder(GetOrderRequest request, ServerCallContext context)
    {
        var auth = context.RequestHeaders.GetValue("authorization");

        await context.WriteResponseHeadersAsync(new Metadata { { "x-served-by", Environment.MachineName } });
        var order = await _repo.FindAsync(request.OrderId, auth);
        context.ResponseTrailers.Add("x-db-time-ms", "12");
        return order!;
    }
}

public class SlowService : OrderService.OrderServiceBase
{
    public static int Aborted;
    private readonly Repo _repo = new();

    public override async Task<Order> GetOrder(GetOrderRequest request, ServerCallContext context)
    {
        if (context.Deadline != DateTime.MaxValue) // MaxValue means "no deadline set"
            Console.WriteLine($"time left: {context.Deadline - DateTime.UtcNow}");
        return (await _repo.FindAsync(request.OrderId, context.CancellationToken))!;
    }
}

public class ErrorService : OrderService.OrderServiceBase
{
    private static readonly Regex ValidId = new(@"^A-\d+$");
    private readonly Repo _repo = new();

    public override async Task<Order> GetOrder(GetOrderRequest request, ServerCallContext context)
    {
        if (!ValidId.IsMatch(request.OrderId))
            throw new RpcException(new Status(StatusCode.InvalidArgument, "order_id must match A-\\d+"));

        var order = request.OrderId == "A-9999" ? null : new Order { Id = request.OrderId };
        return order ?? throw new RpcException(
            new Status(StatusCode.NotFound, $"order {request.OrderId} not found"));
    }
}

public class RichErrorService : OrderService.OrderServiceBase
{
    public override Task<Order> GetOrder(GetOrderRequest request, ServerCallContext context)
    {
        throw new Google.Rpc.Status
        {
            Code = (int)Google.Rpc.Code.InvalidArgument,
            Message = "invalid order_id",
            Details = { Google.Protobuf.WellKnownTypes.Any.Pack(new Google.Rpc.BadRequest
            {
                FieldViolations = { new Google.Rpc.BadRequest.Types.FieldViolation { Field = "order_id", Description = "required" } },
            }) },
        }.ToRpcException();
    }
}

public class LoggingInterceptor(ILogger<LoggingInterceptor> logger) : Grpc.Core.Interceptors.Interceptor
{
    public static int Calls;

    public override async Task<TResponse> UnaryServerHandler<TRequest, TResponse>(
        TRequest request,
        ServerCallContext context,
        UnaryServerMethod<TRequest, TResponse> continuation)
    {
        Interlocked.Increment(ref Calls);
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

public class FlakyService : OrderService.OrderServiceBase
{
    public static int Calls;

    public override Task<Order> GetOrder(GetOrderRequest request, ServerCallContext context)
    {
        if (Interlocked.Increment(ref Calls) <= 2)
            throw new RpcException(new Status(StatusCode.Unavailable, "connection to database lost"));
        return Task.FromResult(new Order { Id = request.OrderId });
    }
}

public class FakeDb
{
    public bool Up = true;
    public bool CanConnect() => Up;
}

public class TlsService : OrderService.OrderServiceBase
{
    public static string? Caller;

    public override Task<Order> GetOrder(GetOrderRequest request, ServerCallContext context)
    {
        var caller = context.GetHttpContext().Connection.ClientCertificate?.GetNameInfo(X509NameType.SimpleName, false);
        Caller = caller;
        return Task.FromResult(new Order { Id = request.OrderId });
    }
}
