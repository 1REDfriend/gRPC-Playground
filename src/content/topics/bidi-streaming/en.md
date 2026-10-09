# Bidirectional streaming
> Both sides send freely on one stream. Anyone can go first, as often as they like.

Put `stream` on both the request and the response and you get bidirectional streaming, usually just "bidi". It feels like a WebSocket, except every message has a type defined in the `.proto`.

```proto
rpc SupportChat(stream ChatMessage) returns (stream ChatMessage);
```

The common misunderstanding is that the two sides take turns, one question and one answer. They don't. Reading and writing are fully independent. In the diagram the server speaks first, sends two messages in a row, and at one point both sides are sending at the same moment.

Closing is independent too. The client half-closes when it has nothing left to say, but the server can keep sending. The stream only really ends when the server sends trailers.

===notes===

## Worth remembering

- Clients usually split reading and writing: a goroutine in Go, a `Task` in C#, event handlers in Node.js. Writing and then blocking on a read in the same flow can deadlock.
- Order is guaranteed **within one direction**. Across directions, nothing promises which arrives first.
- In Python `from` is a keyword, so you need `**{"from": ...}` or `getattr`. When naming `.proto` fields, avoid keywords in your team's languages.
- Good fits: chat, online games, two-way sync, speech-to-text where audio goes in while text comes back.
