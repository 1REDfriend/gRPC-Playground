// @grpc/proto-loader hides encoding from you.
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
console.log(decoded); // { sku: 'SKU-1007', quantity: 150 }
