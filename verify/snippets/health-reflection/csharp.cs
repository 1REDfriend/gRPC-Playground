// dotnet add package Grpc.AspNetCore.HealthChecks
// dotnet add package Grpc.AspNetCore.Server.Reflection
using Microsoft.Extensions.Diagnostics.HealthChecks;

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
