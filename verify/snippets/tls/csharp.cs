using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.Server.Kestrel.Https;

// A PEM key loaded on its own is "ephemeral", and Windows TLS (SChannel) refuses it.
// Round-tripping through PKCS#12 makes it usable everywhere (Linux and macOS don't mind either way).
static X509Certificate2 LoadPem(string certPath, string keyPath)
{
    using var pem = X509Certificate2.CreateFromPemFile(certPath, keyPath);
    return X509CertificateLoader.LoadPkcs12(pem.Export(X509ContentType.Pkcs12), password: null);
}

// ---- Server (mTLS): Program.cs
builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.ConfigureHttpsDefaults(https =>
    {
        https.ServerCertificate = LoadPem("orders.crt", "orders.key");
        https.ClientCertificateMode = ClientCertificateMode.RequireCertificate; // remove for plain TLS
    });
});

// ---- Server: who called?
var caller = context.GetHttpContext().Connection.ClientCertificate?.GetNameInfo(X509NameType.SimpleName, false);

// ---- Client (mTLS)
var handler = new SocketsHttpHandler();
handler.SslOptions.ClientCertificates = new X509CertificateCollection
{
    LoadPem("checkout.crt", "checkout.key"), // omit for plain TLS
};
var channel = GrpcChannel.ForAddress("https://orders.internal", new GrpcChannelOptions
{
    HttpHandler = handler,
});
