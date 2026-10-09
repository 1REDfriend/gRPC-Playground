# Health checks and reflection
> Two standard services: one tells other systems whether you're ready, the other lets people call your API without the .proto file.

gRPC comes with ready-made services that look the same in every language and take a few lines to add. The two you'll use most are health and reflection.

## Health checks

`grpc.health.v1.Health` is the standard way for Kubernetes, a load balancer or a monitor to ask whether a service can take traffic. It has two methods: `Check` for a one-off question, and `Watch`, which keeps a stream open so the server reports changes itself.

Your code decides between SERVING and NOT_SERVING. If the database pool is exhausted, flip to NOT_SERVING and outside systems stop sending work to this pod.

## Reflection

Normally you need the `.proto` file to call a gRPC service, which is a pain when you just want to poke an API or debug something. Reflection lets the server describe its own schema, so tools such as `grpcurl`, Postman or grpcui can ask the server directly.

Try both modes.

===notes===

## Worth remembering

- Kubernetes 1.24+ can use `grpc` as a probe type directly, no extra `grpc_health_probe` binary needed.
- Asking for an empty service name (`""`) returns the health of the whole server.
- Reflection exposes your entire API. Many teams enable it only in dev or staging, or on an internal port outsiders can't reach.
- `grpcurl` feels a lot like `curl`: type JSON in, get JSON back.
