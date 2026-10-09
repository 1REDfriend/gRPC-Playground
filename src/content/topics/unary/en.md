# Unary RPC
> One request goes out, one response comes back. It looks like a normal function call.

Unary is the pattern you will use most. The client calls `GetOrder` the way it would call any function in its own codebase: pass arguments, get a value back. The difference is that the function body runs on another machine.

That single call is five HTTP/2 frames on the wire. The client sends HEADERS naming the method, then a DATA frame carrying the request. The server answers with its own HEADERS, a DATA frame with the response, and finally TRAILERS that say whether the call worked.

> Press Step and click any row in the diagram. The panel on the right shows the real headers and bytes of that frame.

===notes===

## Worth remembering

- The method path comes straight from the `.proto`: `/<package>.<Service>/<Method>`, here `/shop.v1.OrderService/GetOrder`.
- Every message carries a 5-byte prefix: one byte for "is this compressed", four for the length.
- The real result lives in `grpc-status` inside the trailers. HTTP can say `200` and the call can still fail.
- Each language has its own style. Go returns a value plus an `error`, Node.js uses callbacks, Python returns the value directly, C# uses `await`.
- Set a deadline on every call (two seconds in the sample code). Deadlines get their own chapter later.
