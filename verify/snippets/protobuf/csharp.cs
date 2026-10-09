using Google.Protobuf;
using Shop.V1;

var item = new Item { Sku = "SKU-1007", Quantity = 150 };

byte[] data = item.ToByteArray();
Console.WriteLine(Convert.ToHexString(data));

var decoded = Item.Parser.ParseFrom(data);
Console.WriteLine($"{decoded.Sku} x{decoded.Quantity}");

// Protobuf also has a canonical JSON mapping
Console.WriteLine(JsonFormatter.Default.Format(decoded));
