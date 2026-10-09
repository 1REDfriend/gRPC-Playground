// ASP.NET Core speaks gRPC-Web itself, no proxy needed.
// dotnet add package Grpc.AspNetCore.Web
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddGrpc();
builder.Services.AddCors(o => o.AddPolicy("web", p => p
    .WithOrigins("https://shop.example.com")
    .AllowAnyHeader()
    .WithMethods("POST", "OPTIONS")
    .WithExposedHeaders("Grpc-Status", "Grpc-Message", "Grpc-Encoding", "Grpc-Accept-Encoding")));

var app = builder.Build();
app.UseGrpcWeb();
app.UseCors();
app.MapGrpcService<OrderServiceImpl>()
   .EnableGrpcWeb()
   .RequireCors("web");
app.Run();
