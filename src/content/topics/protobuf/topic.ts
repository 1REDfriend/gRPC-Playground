import type { TopicModule } from '../../../lib/types';

const topic: TopicModule = {
  slug: 'protobuf',
  widget: 'proto-encoder',
  code: [
    {
      id: 'proto',
      lang: 'proto',
      code: `syntax = "proto3";

package shop.v1;

import "google/protobuf/timestamp.proto";

message Item {
  string sku = 1;                // field number 1: what goes on the wire, never the name
  int32 quantity = 2;
  int64 price_cents = 3;         // store money as integers, not floats
}

message Order {
  reserved 6;                    // a deleted field: its number must never be reused
  reserved "coupon";

  string id = 1;
  string customer_id = 2;
  repeated Item items = 3;       // a list
  int64 total_cents = 4;
  OrderStatus status = 5;
  map<string, string> labels = 7;
  google.protobuf.Timestamp created_at = 8;

  oneof payment {                // at most one of these is set
    string card_token = 9;
    string bank_ref = 10;
  }

  optional string note = 11;     // "optional" lets you tell "unset" apart from ""
}

enum OrderStatus {
  ORDER_STATUS_UNSPECIFIED = 0;  // proto3 enums must start at 0
  ORDER_STATUS_PENDING = 1;
  ORDER_STATUS_PAID = 2;
}`,
    },
    {
      id: 'go',
      lang: 'go',
      code: `import (
	"log"

	"google.golang.org/protobuf/proto"

	shopv1 "example.com/shop/gen/shop/v1"
)

func roundTrip() {
	item := &shopv1.Item{Sku: "SKU-1007", Quantity: 150}

	data, err := proto.Marshal(item) // []byte, 13 bytes
	if err != nil {
		log.Fatal(err)
	}

	var decoded shopv1.Item
	if err := proto.Unmarshal(data, &decoded); err != nil {
		log.Fatal(err)
	}
	log.Printf("%x -> %s x%d", data, decoded.GetSku(), decoded.GetQuantity())
}`,
    },
    {
      id: 'node',
      lang: 'typescript',
      code: `// @grpc/proto-loader hides encoding from you.
// To see the bytes yourself, use protobufjs directly.
import protobuf from 'protobufjs';

const root = await protobuf.load('shop.proto');
const Item = root.lookupType('shop.v1.Item');

const payload = { sku: 'SKU-1007', quantity: 150 };
const err = Item.verify(payload);
if (err) throw new Error(err);

const bytes = Item.encode(Item.create(payload)).finish(); // Uint8Array
console.log(Buffer.from(bytes).toString('hex'));

const decoded = Item.toObject(Item.decode(bytes));
console.log(decoded); // { sku: 'SKU-1007', quantity: 150 }`,
    },
    {
      id: 'python',
      lang: 'python',
      code: `import shop_pb2

item = shop_pb2.Item(sku="SKU-1007", quantity=150)

data = item.SerializeToString()      # bytes
print(data.hex())

decoded = shop_pb2.Item.FromString(data)
print(decoded.sku, decoded.quantity)

# Unset scalar fields read as their default value, never None
print(decoded.price_cents)           # 0`,
    },
    {
      id: 'csharp',
      lang: 'csharp',
      code: `using Google.Protobuf;
using Shop.V1;

var item = new Item { Sku = "SKU-1007", Quantity = 150 };

byte[] data = item.ToByteArray();
Console.WriteLine(Convert.ToHexString(data));

var decoded = Item.Parser.ParseFrom(data);
Console.WriteLine($"{decoded.Sku} x{decoded.Quantity}");

// Protobuf also has a canonical JSON mapping
Console.WriteLine(JsonFormatter.Default.Format(decoded));`,
    },
  ],
};

export default topic;
