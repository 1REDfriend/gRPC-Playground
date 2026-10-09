import type { SimEvent, TopicModule } from '../../../lib/types';
import { RESPONSE_HEADERS, grpcFrame, l, requestHeaders, trailers } from '../../shared';
import { stringField } from '../../../lib/protobuf';

function msg(at: number, from: 'client' | 'server', who: string, text: string, note?: ReturnType<typeof l>): SimEvent {
  return {
    at,
    from,
    to: from === 'client' ? 'server' : 'client',
    kind: 'data',
    label: `DATA "${text}"`,
    detail: grpcFrame([...stringField('from', 1, who), ...stringField('text', 2, text)], `ChatMessage{from:"${who}", text:"${text}"}`),
    note,
  };
}

const topic: TopicModule = {
  slug: 'bidi-streaming',
  sim: {
    build: () => ({
      actors: [
        { id: 'client', label: l('ลูกค้า (Client)', 'Customer (client)') },
        { id: 'server', label: l('ฝ่ายบริการ (Server)', 'Support (server)') },
      ],
      events: [
        {
          at: 0,
          from: 'client',
          to: 'server',
          kind: 'headers',
          label: 'HEADERS SupportChat',
          detail: requestHeaders('SupportChat'),
          note: l('เปิด stream เดียว ใช้คุยกันได้ทั้งสองทาง', 'One stream, usable in both directions.'),
        },
        { at: 300, from: 'server', to: 'client', kind: 'headers', label: 'HEADERS :status 200', detail: RESPONSE_HEADERS },
        msg(700, 'server', 'bot', 'Hi! How can I help?', l('server ส่งก่อนได้ ไม่ต้องรอ client', 'The server can speak first.')),
        msg(1300, 'client', 'C-42', 'Where is order A-1001?'),
        msg(1900, 'server', 'bot', 'Checking...', l('ตอบหลายครั้งต่อหนึ่งคำถามก็ได้', 'Several replies to one message is fine.')),
        msg(2050, 'client', 'C-42', 'It was due yesterday', l('สองฝั่งส่งสวนกันพร้อมกันได้', 'Both sides can send at the same time.')),
        msg(2700, 'server', 'bot', 'Out for delivery, ETA 14:00'),
        msg(3300, 'client', 'C-42', 'Thanks!'),
        {
          at: 3800,
          from: 'client',
          to: 'server',
          kind: 'data',
          label: 'DATA (empty, END_STREAM)',
          detail: 'DATA frame, length 0\nflags: END_STREAM',
          note: l('client ไม่มีอะไรจะส่งแล้ว แต่ยังฟังอยู่', 'The client stops sending but keeps listening.'),
        },
        msg(4300, 'server', 'bot', 'Have a nice day!', l('server ยังส่งต่อได้หลัง client half-close', 'The server can still send after the client half-closes.')),
        {
          at: 4900,
          from: 'server',
          to: 'client',
          kind: 'trailers',
          label: 'TRAILERS grpc-status 0',
          detail: trailers(0),
          note: l('stream ปิดสมบูรณ์เมื่อ server ส่ง trailers', 'The stream fully closes when the server sends trailers.'),
        },
      ],
      outcome: { ok: true, text: l('ต่างฝ่ายต่างส่ง ไม่ต้องรอกัน', 'Each side sent on its own schedule.') },
    }),
  },
  code: [
    {
      id: 'proto',
      lang: 'proto',
      code: `service OrderService {
  rpc SupportChat(stream ChatMessage) returns (stream ChatMessage);
}

message ChatMessage { string from = 1; string text = 2; }`,
    },
    {
      id: 'go',
      lang: 'go',
      code: `// Server: reading and writing are independent
func (s *orderServer) SupportChat(stream shopv1.OrderService_SupportChatServer) error {
	if err := stream.Send(&shopv1.ChatMessage{From: "bot", Text: "Hi! How can I help?"}); err != nil {
		return err
	}
	for {
		in, err := stream.Recv()
		if err == io.EOF {
			return stream.Send(&shopv1.ChatMessage{From: "bot", Text: "Have a nice day!"})
		}
		if err != nil {
			return err
		}
		for _, reply := range s.bot.Answer(in.GetText()) {
			if err := stream.Send(&shopv1.ChatMessage{From: "bot", Text: reply}); err != nil {
				return err
			}
		}
	}
}

// Client: receive in a goroutine, send from the main flow
stream, err := client.SupportChat(ctx)
if err != nil {
	log.Fatal(err)
}
done := make(chan struct{})
go func() {
	defer close(done)
	for {
		m, err := stream.Recv()
		if err != nil { // io.EOF when the server finishes
			return
		}
		fmt.Printf("%s: %s\\n", m.GetFrom(), m.GetText())
	}
}()
for _, line := range []string{"Where is order A-1001?", "Thanks!"} {
	stream.Send(&shopv1.ChatMessage{From: "C-42", Text: line})
}
stream.CloseSend() // half-close
<-done`,
    },
    {
      id: 'node',
      lang: 'typescript',
      code: `// Server: call is a Duplex stream
server.addService(shop.OrderService.service, {
  supportChat(call: grpc.ServerDuplexStream<any, any>) {
    call.write({ from: 'bot', text: 'Hi! How can I help?' });
    call.on('data', (msg: any) => {
      for (const reply of bot.answer(msg.text)) call.write({ from: 'bot', text: reply });
    });
    call.on('end', () => {
      call.write({ from: 'bot', text: 'Have a nice day!' });
      call.end();
    });
  },
});

// Client
const chat = client.supportChat();
chat.on('data', (m: any) => console.log(\`\${m.from}: \${m.text}\`));
chat.on('end', () => console.log('chat closed'));

chat.write({ from: 'C-42', text: 'Where is order A-1001?' });
setTimeout(() => {
  chat.write({ from: 'C-42', text: 'Thanks!' });
  chat.end(); // half-close
}, 2000);`,
    },
    {
      id: 'python',
      lang: 'python',
      code: `# Server: consume request_iterator, yield replies whenever you like
class OrderService(shop_pb2_grpc.OrderServiceServicer):
    def SupportChat(self, request_iterator, context):
        yield shop_pb2.ChatMessage(**{"from": "bot", "text": "Hi! How can I help?"})
        for msg in request_iterator:
            for reply in bot.answer(msg.text):
                yield shop_pb2.ChatMessage(**{"from": "bot", "text": reply})
        yield shop_pb2.ChatMessage(**{"from": "bot", "text": "Have a nice day!"})

# "from" is a Python keyword, so pass it via ** or use getattr(msg, "from")


# Client: send from a generator, read from the returned iterator
def outgoing():
    for line in ["Where is order A-1001?", "Thanks!"]:
        yield shop_pb2.ChatMessage(**{"from": "C-42", "text": line})

for reply in stub.SupportChat(outgoing()):
    print(getattr(reply, "from"), reply.text)`,
    },
    {
      id: 'csharp',
      lang: 'csharp',
      code: `// Server
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
await reader;`,
    },
  ],
};

export default topic;
