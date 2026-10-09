# gRPC-Web: calling from a browser
> Browsers can't speak gRPC directly. gRPC-Web and a small proxy bridge the gap.

So far every example has been server to server, or an app with full control over its network stack. What if you want to call `OrderService` from React or Vue in a browser?

Two things stand in the way. Browser JavaScript has no API for driving HTTP/2 frames. Worse, browsers can't read HTTP trailers, and trailers are where gRPC puts `grpc-status`. Without them you can't tell whether a call worked.

**gRPC-Web** is a variant of the protocol built for browsers. It travels over plain `fetch`, and the trailers move to the end of the response body. A proxy such as Envoy translates between gRPC-Web and real gRPC.

Press Step and look at the last frame the proxy sends to the browser. The body holds the message and then a trailer frame, back to back.

===notes===

## Worth remembering

- gRPC-Web supports unary and server streaming only. **Client streaming and bidi don't work**, because browser `fetch` still can't reliably stream a request body everywhere.
- ASP.NET Core supports gRPC-Web natively, no proxy required. Other languages usually put Envoy in front.
- In Go, if you'd rather skip the proxy, connect-go serves gRPC, gRPC-Web and the Connect protocol from one handler.
- On the browser side, Connect-ES (`@connectrpc/connect-web`) has largely replaced the original `grpc-web` package: full TypeScript types and ordinary `async/await`.
- Mind CORS. Expose the `grpc-status` and `grpc-message` headers, or your browser code can't read errors.

## Where to go from here

Take `shop.proto`, generate code in your language, and get `GetOrder` running for real. Then add streaming, deadlines and an interceptor one at a time, poking at it with `grpcurl` as you go. The full documentation lives at [grpc.io](https://grpc.io/docs/).
