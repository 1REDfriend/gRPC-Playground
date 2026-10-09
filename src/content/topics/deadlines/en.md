# Deadlines and cancellation
> Say up front how long you'll wait. When time runs out, client and server both stop.

Without a deadline, a stuck call waits forever and holds a thread or connection the whole time. One slow server and the slowness spreads through the system. The gRPC team's advice is blunt: **every call should have a deadline.**

gRPC deadlines differ from an ordinary timeout in two ways:

- **The server knows too.** The deadline is sent in the `grpc-timeout` header, so the server knows how much time is left.
- **It propagates.** If the server calls another service, it passes the same context along. The remaining time shrinks at each hop, so nobody downstream waits longer than the original caller can.

Set the deadline lower than the server's work time and see what happens. Then switch to "User cancels".

===notes===

## How the two failures differ

| | `DEADLINE_EXCEEDED` (4) | `CANCELLED` (1) |
|---|---|---|
| Cause | Time ran out | The client cancelled on purpose |
| Example | A downstream API took over 2 seconds | The user closed the screen or pressed Cancel |
| Retry? | Maybe, if the method is safe to repeat | No. Nobody wants the result any more |

## Worth remembering

- On the client, pick deadlines from the user's point of view: how long will someone stare at this screen?
- On the server, always pass the context or cancellation token to the database, HTTP clients and the next gRPC call. Otherwise the client has given up but your server keeps grinding.
- Don't hardcode deadlines at every layer. If the outer layer allows 1 second, an inner 5-second deadline is pointless. Use whatever time the context has left.
- Streams that are meant to stay open don't need a short deadline. Let cancellation and keepalive look after them.
