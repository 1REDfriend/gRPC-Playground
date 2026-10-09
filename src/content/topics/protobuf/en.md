# Protocol Buffers
> A language for describing data, and the binary format that data travels in.

Protocol Buffers (Protobuf for short) does two jobs. It is the language you write `.proto` files in, declaring messages and services. It is also the binary format gRPC uses to put those messages on the wire.

The key idea is the **field number**. In `string sku = 1;` the `1` is not a default value. It is the field's identity. The name `sku` never travels; only the number and the value do, which is why Protobuf is so much smaller than JSON.

Each field on the wire has up to three parts:

1. **Tag**: `(field number << 3) | wire type`. Wire type 0 is a number (varint); 2 is anything with a length, such as a string or a nested message.
2. **Length**: only for wire type 2.
3. **Value**: numbers are varints, 7 bits per byte, so small numbers take a single byte.

Edit the fields below and watch the bytes change.

===notes===

## Rules you cannot break

- **Never change the number** of a field that is in use. Older clients will decode garbage.
- You can delete a field, but mark it `reserved` so nobody reuses the number later.
- You can add fields at any time. Code that doesn't know a field skips it. This is what lets you deploy clients and servers independently.
- Unset fields read as defaults (`""`, `0`, `false`). If you need to tell "unset" from "empty", use `optional`.
- Field numbers 1 to 15 fit in a one-byte tag. Spend them on fields you send often.
- Store money as integer cents (`int64 price_cents`), not `double`.

## Common types

| In .proto | Go | TypeScript | Python | C# |
|---|---|---|---|---|
| `string` | `string` | `string` | `str` | `string` |
| `int32` / `int64` | `int32` / `int64` | `number` | `int` | `int` / `long` |
| `bool` | `bool` | `boolean` | `bool` | `bool` |
| `bytes` | `[]byte` | `Uint8Array` | `bytes` | `ByteString` |
| `repeated T` | `[]T` | `T[]` | list-like | `RepeatedField<T>` |
| `map<K,V>` | `map[K]V` | `Record<K,V>` | dict-like | `MapField<K,V>` |
