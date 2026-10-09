# What is gRPC
> A framework for calling functions on another machine, with a schema as the contract.

gRPC is a framework Google open-sourced in 2015; it now lives under the CNCF. The idea is simple. You write one `.proto` file that lists the methods a service has and the shape of what each one takes and returns. Tooling then generates server and client code in whatever languages you use.

At runtime the client calls `client.GetOrder(...)` as if the function were local. Turning data into bytes, sending it over the network and turning it back into a typed object are gRPC's job, not yours.

## How it differs from REST + JSON

| | REST + JSON | gRPC |
|---|---|---|
| Contract between client and server | Docs, or OpenAPI if you have it | A `.proto` file that actually compiles |
| Data format | JSON text: readable, but large | Protobuf binary: small and fast to parse |
| Transport | HTTP/1.1 or HTTP/2 | Always HTTP/2 |
| Streaming | Bolt on WebSockets or SSE | Built in, in both directions |
| Calling from a browser | Works out of the box | Needs gRPC-Web or a proxy |

Drag the slider below. The same order data encoded as Protobuf comes out at roughly a third of the JSON size.

===notes===

## Where gRPC fits

- Services talking to each other inside your system, where speed matters and every side should agree on types.
- Mixed-language shops. The backend is Go, the data team writes Python, and both compile the same `.proto`.
- Anything that streams: order tracking, chat, log shipping.
- Mobile apps that want to save bandwidth.

For a public API that anyone should be able to hit from a browser or `curl`, REST is still easier. Plenty of teams run both: gRPC inside, REST at the edge.

The rest of this site uses the `shop.proto` above. The next chapter takes it apart.
