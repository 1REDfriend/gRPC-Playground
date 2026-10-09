# Metadata (headers and trailers)
> Side information attached to a call but kept out of the message: tokens, request ids, trace context.

Some data isn't part of "what you're asking for" but the call still needs it: a token saying who is calling, a request id for finding logs later. That doesn't belong in every `GetOrderRequest`. gRPC gives it a separate channel called **metadata**, key/value pairs much like HTTP headers.

Metadata can travel at three points. Play the simulation and watch which frame each one shows up in.

1. **Request metadata** rides in the client's HEADERS, before the message.
2. **Response headers** ride in the server's HEADERS, before the reply.
3. **Response trailers** ride in TRAILERS at the end. Use them for values you only know once the work is done, like how long the query took.

===notes===

## Key rules

- Keys are always lowercase. Set `Authorization` and it arrives as `authorization`.
- Keys ending in `-bin` carry binary values; they are base64-encoded on the wire for you.
- Keys starting with `grpc-` are reserved for gRPC itself.
- Total metadata size is capped (often around 8 KB by default). Don't stuff large blobs in there.

## What people use it for

- Authentication tokens.
- Request ids or trace context (`traceparent`) so every service logs under the same id.
- The client app version, so the server can make feature-flag decisions.
- Server-side extras the client may want: remaining rate limit, which pod answered.

These concerns repeat on every method, so reading metadata by hand in each handler gets old fast. The interceptors chapter shows how to do it in one place.
