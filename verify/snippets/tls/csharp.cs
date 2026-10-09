// ---- Server (mTLS): Program.cs
using Microsoft.AspNetCore.Server.Kestrel.Https;

builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.ConfigureHttpsDefaults(https =>
    {
        https.ServerCertificate = X509Certificate2.CreateFromPemFile("orders.crt", "orders.key");
        https.ClientCertificateMode = ClientCertificateMode.RequireCertificate; // remove for plain TLS
    });
});

// ---- Server: who called?
var caller = context.GetHttpContext().Connection.ClientCertificate?.GetNameInfo(X509NameType.SimpleName, false);

// ---- Client (mTLS)
var handler = new SocketsHttpHandler();
handler.SslOptions.ClientCertificates = new X509CertificateCollection
{
    X509Certificate2.CreateFromPemFile("checkout.crt", "checkout.key"), // omit for plain TLS
};
var channel = GrpcChannel.ForAddress("https://orders.internal", new GrpcChannelOptions
{
    HttpHandler = handler,
});
