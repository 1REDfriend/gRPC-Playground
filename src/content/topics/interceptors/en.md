# Interceptors (middleware)
> Code that wraps every call, running before and after the handler. The place for work every method needs.

Count what each method repeats: check the token, write a log line, time the call, emit a metric, attach a trace id. Put all that in every handler and you get a lot of copy-paste, plus one handler somewhere that forgot.

An interceptor is a layer wrapped around the handler, much like Express or ASP.NET middleware. Each layer does its job and calls `next` (or `handler`, or `continuation`, depending on the language) to pass control inward. On the way back, the layers run in reverse.

Pick "Missing" for the token. The Auth layer returns an error without calling `next`, so the handler never runs at all. Logging, being the outermost layer, still records the result.

===notes===

## Worth remembering

- **Order matters.** Put logging and tracing outermost so you see every call, including the ones auth rejected.
- Interceptors exist on both server and client. Client-side ones usually attach tokens, inject trace context or retry.
- Unary and streaming calls use different interceptor types. Go has separate `UnaryServerInterceptor` and `StreamServerInterceptor`. Register only one, and your streaming methods quietly skip auth.
- You don't have to write them all. There's `go-grpc-middleware` for Go, and OpenTelemetry ships tracing interceptors for nearly every language.
- In .NET, ASP.NET Core's own middleware handles auth well. Keep interceptors for gRPC-specific work.
