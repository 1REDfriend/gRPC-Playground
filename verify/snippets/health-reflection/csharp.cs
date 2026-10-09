// dotnet add package Grpc.AspNetCore.HealthChecks
// dotnet add package Grpc.AspNetCore.Server.Reflection
builder.Services.AddGrpc();
builder.Services.AddGrpcHealthChecks()
    .AddCheck("database", () => db.CanConnect()
        ? HealthCheckResult.Healthy()
        : HealthCheckResult.Unhealthy());
builder.Services.AddGrpcReflection();

var app = builder.Build();
app.MapGrpcService<OrderServiceImpl>();
app.MapGrpcHealthChecksService();
if (app.Environment.IsDevelopment())
{
    app.MapGrpcReflectionService();
}
