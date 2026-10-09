# Retries and keepalive
> Let the library retry transient failures, and keep checking that the connection is still alive.

Real systems fail briefly all the time: a pod restarting, half a second of network trouble, a database failing over. If every one of those reached the user, the system would look far more broken than it is.

## Retries

gRPC can retry for you through a **service config**, a JSON document saying which methods may retry, how many times, how long to wait, and which status codes count as retryable. Your code calls `GetOrder` as usual. If the first attempt fails and the third works, your code never knows there were retries.

The wait doubles each round (exponential backoff) with a random spread (jitter), so a thousand clients don't all come back at the same instant and knock the server over again.

## Keepalive

Long-lived connections sometimes die quietly. A NAT or load balancer drops them for being idle and nobody tells the client. The client finds out only when the next call hangs until its deadline. Keepalive sends an HTTP/2 PING every so often. No ACK within the timeout means the connection is closed and replaced.

Try both modes. In Retry mode, also set the failure count to 4.

===notes===

## Be careful

- **Only retry methods that are safe to repeat** (idempotent). Retrying `GetOrder` is fine. Retrying `ChargeCard` blindly can charge a customer twice. If you must, send an idempotency key with the request.
- Keep `retryableStatusCodes` to transient failures, usually just `UNAVAILABLE`. Never `INVALID_ARGUMENT` or `INTERNAL`.
- All retries share the original deadline. When it runs out, retrying stops.
- If clients send keepalive pings, the server must allow them. Otherwise it decides the client is pinging too often and closes the connection with `too_many_pings`.
- Recent library versions have retries on by default; all you supply is the service config. On an older version where retries don't seem to happen, check the `grpc.enable_retries` option.
