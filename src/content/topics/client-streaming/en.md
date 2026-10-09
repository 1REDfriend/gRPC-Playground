# Client streaming
> The client sends many messages, and the server answers once at the end.

This is the mirror of the previous chapter. The client sends several times; the server waits until it has everything, then replies with a single message. In the `.proto`, `stream` moves to the request side:

```proto
rpc UploadItems(stream Item) returns (UploadSummary);
```

Here the client uploads a cart one item at a time. With REST you would either pack every item into one big JSON body or fire one request per item. The first eats memory when the data is large; the second pays a round-trip each time. Client streaming gets you the good half of both: items go one by one over a single connection, and the server can tally them as they arrive.

Look at the client's last frame in the diagram. It is an empty DATA frame with the `END_STREAM` flag, which tells the server "that's everything". Only then does the server reply.

===notes===

## Worth remembering

- Closing your sending side is called a **half-close**. The client can still receive; it just stops sending.
- If the client forgets to half-close, the server waits until the deadline runs out. This is a very common bug.
- Each language spells it differently: `CloseAndRecv()` in Go, `call.end()` in Node.js, `CompleteAsync()` in C#, and in Python the generator simply finishes.
- The server can fail the call at any point without waiting for the rest. An unknown SKU can get `INVALID_ARGUMENT` straight away.
- Good fits: chunked file uploads, batches of sensor readings, importing thousands of rows.
