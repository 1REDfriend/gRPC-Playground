# Security: TLS and mTLS
> Encrypt every frame and prove each side is who it claims to be, not someone listening in the middle.

The earlier chapters used `insecure` to keep the code short. In real deployments every connection should run over TLS, so order data, tokens and customer details can't be read in transit.

**Plain TLS** lets the client check the server's certificate, the same check a browser does for an https site. The client knows it reached the real `orders.internal`. The server, though, has no idea who is calling and has to rely on a token in the metadata.

**mTLS (mutual TLS)** checks both ways. The client has its own certificate, so the server knows at the connection level that the caller is `checkout-service`. This is the usual way internal services prove their identity to each other.

Switch between the two modes and compare the handshakes.

===notes===

## Worth remembering

- gRPC negotiates HTTP/2 through ALPN during the handshake. A proxy or load balancer that doesn't support ALPN will break the connection.
- TLS and tokens work together, and you should use both. TLS protects the channel; a token (say a JWT in `authorization`) says which user asked.
- Running mTLS yourself means issuing and rotating hundreds of certificates before they expire. Many teams let a service mesh such as Istio or Linkerd do mTLS automatically while the app talks plaintext inside the pod.
- In .NET, most TLS settings live in Kestrel rather than in gRPC code. On Windows, a certificate loaded from PEM files has to be round-tripped through PKCS#12 first (the `LoadPem` helper in the sample), or the handshake fails partway.
- Never turn off certificate verification (`InsecureSkipVerify` or similar) in production. The traffic is still encrypted, but anyone can pretend to be the server.
