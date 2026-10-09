# HTTP/2 multiplexing
> Many calls share one connection at the same time, and a slow one doesn't block the rest.

gRPC always runs on HTTP/2, and the HTTP/2 feature it leans on most is **multiplexing**. Every call gets its own numbered stream (1, 3, 5, ...). Frames from different streams interleave on a single TCP connection without getting mixed up.

What about HTTP/1.1? One connection carries one request at a time. The next request waits until the previous response is back. If the first one is slow, everything queued behind it is slow too. That is head-of-line blocking. Browsers work around it by opening several connections, but each of those pays for its own handshake.

Switch between HTTP/1.1 and HTTP/2 below. Both send the same three requests; the first takes the longest to process.

===notes===

## What this means for your code

- **Create a channel or client once and reuse it.** A new one per request pays the handshake every time and throws away multiplexing.
- Channels are safe to use from many threads or goroutines at once. Share one across the app.
- Servers cap concurrent streams per connection (100 is common). Beyond that, calls queue. In .NET, `EnableMultipleHttp2Connections` lets the client open more connections on its own.
- HTTP/2 also compresses headers with HPACK, so headers that repeat on every call, like `:path` and `content-type`, cost almost nothing after the first time.

> Multiplexing fixes head-of-line blocking at the HTTP layer only. If a TCP packet is lost, every stream on that connection still waits for the retransmit. HTTP/3 (QUIC) is what fixes that.
