# Server streaming
> Send one request, and the server keeps sending data back until it runs out.

Think of a parcel tracking page. With plain REST the client asks "has anything changed?" every few seconds. That wastes requests and still shows the update late.

Server streaming fixes this directly. The client calls `WatchOrder` once, the stream stays open, and the server pushes an `OrderEvent` the moment the status changes. In the `.proto` you only add `stream` in front of the return type:

```proto
rpc WatchOrder(WatchOrderRequest) returns (stream OrderEvent);
```

In the diagram the response is not one message. It is several DATA frames on the same stream, with TRAILERS once at the very end. Change the number of events and play it again.

===notes===

## Worth remembering

- The client reads one message at a time in a loop. It doesn't wait for the server to finish.
- The client loop ends when the server closes the stream: `io.EOF` in Go, the iterator runs out in Python, an `end` event in Node.js.
- The server must check whether the client is still there (`stream.Context().Done()`, `context.is_active()`, `CancellationToken`). Otherwise it keeps writing to someone who closed the app ten minutes ago.
- For long-lived streams, set a generous deadline or none at all and rely on keepalive (see Retries and keepalive).
- Other good fits: live stock prices, a large query result sent in chunks, LLM tokens streamed one at a time.
