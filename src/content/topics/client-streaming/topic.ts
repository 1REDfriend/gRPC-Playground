import type { SimEvent, TopicModule } from '../../../lib/types';
import { CLIENT, RESPONSE_HEADERS, SERVER, grpcFrame, l, requestHeaders, trailers } from '../../shared';
import { stringField, varintField } from '../../../lib/protobuf';

const topic: TopicModule = {
  slug: 'client-streaming',
  sim: {
    controls: [
      {
        kind: 'range',
        id: 'items',
        label: l('จำนวนสินค้าที่ client ส่ง', 'Items the client sends'),
        min: 1,
        max: 8,
        step: 1,
        default: 4,
      },
    ],
    build: (p) => {
      const n = Number(p.items);
      const events: SimEvent[] = [
        {
          at: 0,
          from: 'client',
          to: 'server',
          kind: 'headers',
          label: 'HEADERS UploadItems',
          detail: requestHeaders('UploadItems'),
          note: l('เปิด stream ไว้ก่อน ยังไม่ต้องมีข้อมูลครบ', 'Opens the stream before any data is ready.'),
        },
      ];
      let total = 0;
      for (let i = 0; i < n; i++) {
        const sku = `SKU-${1000 + i * 7}`;
        const qty = (i % 3) + 1;
        const price = 1990 + i * 250;
        total += qty * price;
        events.push({
          at: 300 + i * 520,
          from: 'client',
          to: 'server',
          kind: 'data',
          label: `DATA Item ${sku} ×${qty}`,
          detail: grpcFrame(
            [...stringField('sku', 1, sku), ...varintField('quantity', 2, qty), ...varintField('price_cents', 3, price)],
            `Item{sku:"${sku}", quantity:${qty}, price_cents:${price}}`,
          ),
          note:
            i === 0
              ? l('ส่งสินค้าชิ้นแรก server เริ่มประมวลผลได้เลย', 'First item. The server can start working on it now.')
              : undefined,
        });
        events.push({
          at: 300 + i * 520 + 650,
          from: 'server',
          to: 'server',
          kind: 'note',
          label: `count=${i + 1} total=${total}`,
        });
      }
      const closeAt = 300 + n * 520;
      events.push(
        {
          at: closeAt,
          from: 'client',
          to: 'server',
          kind: 'data',
          label: 'DATA (empty, END_STREAM)',
          detail: 'DATA frame, length 0\nflags: END_STREAM\n\nThe client has nothing more to send (half-close).',
          note: l('client บอกว่าส่งครบแล้ว (half-close)', 'The client says it is done sending (half-close).'),
        },
        {
          at: closeAt + 900,
          from: 'server',
          to: 'client',
          kind: 'headers',
          label: 'HEADERS :status 200',
          detail: RESPONSE_HEADERS,
        },
        {
          at: closeAt + 1100,
          from: 'server',
          to: 'client',
          kind: 'data',
          label: `DATA UploadSummary count=${n}`,
          detail: grpcFrame([...varintField('item_count', 1, n), ...varintField('total_cents', 2, total)], `UploadSummary{item_count:${n}, total_cents:${total}}`),
          note: l('server ตอบกลับครั้งเดียว หลังได้ของครบ', 'The server answers once, after it has everything.'),
        },
        {
          at: closeAt + 1300,
          from: 'server',
          to: 'client',
          kind: 'trailers',
          label: 'TRAILERS grpc-status 0',
          detail: trailers(0),
        },
      );
      return {
        actors: [CLIENT, SERVER],
        events,
        outcome: { ok: true, text: l(`${n} requests → 1 response`, `${n} requests → 1 response`) },
      };
    },
  },
  code: [
    {
      id: 'proto',
      lang: 'proto',
      code: `service OrderService {
  rpc UploadItems(stream Item) returns (UploadSummary);
}

message Item { string sku = 1; int32 quantity = 2; int64 price_cents = 3; }
message UploadSummary { int32 item_count = 1; int64 total_cents = 2; }`,
    },
    {
      id: 'go',
      lang: 'go',
      code: `// Server
func (s *orderServer) UploadItems(stream shopv1.OrderService_UploadItemsServer) error {
	var count int32
	var total int64
	for {
		item, err := stream.Recv()
		if err == io.EOF {
			// client half-closed: send the single response and finish
			return stream.SendAndClose(&shopv1.UploadSummary{ItemCount: count, TotalCents: total})
		}
		if err != nil {
			return err
		}
		count++
		total += int64(item.GetQuantity()) * item.GetPriceCents()
	}
}

// Client
stream, err := client.UploadItems(ctx)
if err != nil {
	log.Fatal(err)
}
for _, it := range cart {
	if err := stream.Send(it); err != nil {
		log.Fatal(err)
	}
}
summary, err := stream.CloseAndRecv() // half-close, then wait for the response
if err != nil {
	log.Fatal(err)
}
log.Printf("uploaded %d items, total %d", summary.GetItemCount(), summary.GetTotalCents())`,
    },
    {
      id: 'node',
      lang: 'typescript',
      code: `// Server
server.addService(shop.OrderService.service, {
  uploadItems(call: grpc.ServerReadableStream<any, any>, callback: grpc.sendUnaryData<any>) {
    let itemCount = 0;
    let totalCents = 0;
    call.on('data', (item: any) => {
      itemCount++;
      totalCents += item.quantity * item.priceCents;
    });
    call.on('end', () => callback(null, { itemCount, totalCents }));
    call.on('error', (err) => console.error(err));
  },
});

// Client
const call = client.uploadItems((err: grpc.ServiceError | null, summary: any) => {
  if (err) return console.error(err.code, err.details);
  console.log(\`uploaded \${summary.itemCount} items, total \${summary.totalCents}\`);
});
for (const item of cart) call.write(item);
call.end(); // half-close`,
    },
    {
      id: 'python',
      lang: 'python',
      code: `# Server: request_iterator yields each Item as it arrives
class OrderService(shop_pb2_grpc.OrderServiceServicer):
    def UploadItems(self, request_iterator, context):
        count, total = 0, 0
        for item in request_iterator:
            count += 1
            total += item.quantity * item.price_cents
        return shop_pb2.UploadSummary(item_count=count, total_cents=total)


# Client: pass any iterator; the generator ending is the half-close
def items():
    for sku, qty, price in cart:
        yield shop_pb2.Item(sku=sku, quantity=qty, price_cents=price)

summary = stub.UploadItems(items())
print(summary.item_count, summary.total_cents)`,
    },
    {
      id: 'csharp',
      lang: 'csharp',
      code: `// Server
public override async Task<UploadSummary> UploadItems(
    IAsyncStreamReader<Item> requestStream, ServerCallContext context)
{
    var summary = new UploadSummary();
    await foreach (var item in requestStream.ReadAllAsync(context.CancellationToken))
    {
        summary.ItemCount++;
        summary.TotalCents += item.Quantity * item.PriceCents;
    }
    return summary;
}

// Client
using var call = client.UploadItems();
foreach (var item in cart)
{
    await call.RequestStream.WriteAsync(item);
}
await call.RequestStream.CompleteAsync(); // half-close

var summary = await call; // or: await call.ResponseAsync
Console.WriteLine($"uploaded {summary.ItemCount} items, total {summary.TotalCents}");`,
    },
  ],
};

export default topic;
