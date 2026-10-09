# Status codes and errors
> Every call ends with one of seventeen status codes. Pick the right one and the client can react correctly.

REST has HTTP statuses like 404 and 500. gRPC has its own set of seventeen codes, returned in `grpc-status` with a human-readable `grpc-message`.

The diagram shows something else worth noticing. On an error the server sends no DATA at all. It sends a single HEADERS frame carrying the status and closes the stream, a shape called Trailers-Only. The HTTP status is still `200`, because nothing went wrong at the HTTP level. It was the call that failed.

Pick each error in turn and look at how the client should handle it.

===notes===

## Codes you'll use

| Code | Name | When | Retry? |
|---|---|---|---|
| 0 | `OK` | Success | |
| 1 | `CANCELLED` | The client cancelled | No |
| 3 | `INVALID_ARGUMENT` | The request is wrong no matter what state the system is in | No |
| 4 | `DEADLINE_EXCEEDED` | Time ran out | Yes, if the call is safe to repeat |
| 5 | `NOT_FOUND` | The thing doesn't exist | No |
| 6 | `ALREADY_EXISTS` | Creating something that's already there | No |
| 7 | `PERMISSION_DENIED` | We know who you are; you're not allowed | No |
| 8 | `RESOURCE_EXHAUSTED` | Rate limit or quota hit | Yes, after waiting |
| 9 | `FAILED_PRECONDITION` | Wrong system state, e.g. cancelling a shipped order | No, fix the state first |
| 10 | `ABORTED` | Conflict with another transaction | Yes, the whole transaction |
| 12 | `UNIMPLEMENTED` | The server doesn't have this method | No |
| 13 | `INTERNAL` | A server bug | No |
| 14 | `UNAVAILABLE` | Temporarily down | Yes, with backoff |
| 16 | `UNAUTHENTICATED` | Missing or invalid credentials | No, get a new token first |

The rest are `UNKNOWN` (2), `OUT_OF_RANGE` (11) and `DATA_LOSS` (15).

## More than a message

When a string isn't enough, say you want to tell the client which field is wrong, use Google's rich error model. Attach a `google.rpc.Status` containing `BadRequest`, `RetryInfo` or `ErrorInfo` in the `grpc-status-details-bin` trailer, and the client decodes typed objects instead of parsing text.

> Don't send stack traces or raw database errors back in `INTERNAL`. Log them on the server and return something generic.
