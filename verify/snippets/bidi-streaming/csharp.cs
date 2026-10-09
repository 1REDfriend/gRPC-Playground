// Server
public override async Task SupportChat(
    IAsyncStreamReader<ChatMessage> requestStream,
    IServerStreamWriter<ChatMessage> responseStream,
    ServerCallContext context)
{
    await responseStream.WriteAsync(new ChatMessage { From = "bot", Text = "Hi! How can I help?" });
    await foreach (var msg in requestStream.ReadAllAsync(context.CancellationToken))
    {
        foreach (var reply in _bot.Answer(msg.Text))
            await responseStream.WriteAsync(new ChatMessage { From = "bot", Text = reply });
    }
    await responseStream.WriteAsync(new ChatMessage { From = "bot", Text = "Have a nice day!" });
}

// Client: read on a background task, write from the main flow
using var call = client.SupportChat();

var reader = Task.Run(async () =>
{
    await foreach (var m in call.ResponseStream.ReadAllAsync())
        Console.WriteLine($"{m.From}: {m.Text}");
});

await call.RequestStream.WriteAsync(new ChatMessage { From = "C-42", Text = "Where is order A-1001?" });
await call.RequestStream.WriteAsync(new ChatMessage { From = "C-42", Text = "Thanks!" });
await call.RequestStream.CompleteAsync(); // half-close
await reader;
