# Protocol Buffers
> ภาษาสำหรับประกาศหน้าตาข้อมูล และรูปแบบ binary ที่ใช้ส่งข้อมูลนั้นจริง ๆ

Protocol Buffers (เรียกสั้น ๆ ว่า Protobuf) มีสองบทบาท อย่างแรกคือเป็นภาษาที่ใช้เขียน `.proto` เพื่อประกาศ message กับ service อย่างที่สองคือเป็นรูปแบบ binary ที่ gRPC ใช้ส่ง message พวกนั้นบนสาย

หัวใจของ Protobuf คือ **field number** ตัวเลขหลังเครื่องหมาย `=` อย่าง `string sku = 1;` ไม่ได้เป็นค่าเริ่มต้น แต่เป็นเลขประจำตัวของ field ตอนส่งข้อมูลจริง ชื่อ `sku` ไม่ได้ถูกส่งไปด้วยเลย ส่งไปแค่เลข 1 กับค่า ข้อมูลเลยเล็กกว่า JSON มาก

แต่ละ field บนสายประกอบด้วยสามส่วน

1. **tag** คำนวณจาก `(field number << 3) | wire type` wire type 0 คือตัวเลข (varint) ส่วน 2 คือข้อมูลที่มีความยาว เช่น string หรือ message ซ้อน
2. **ความยาว** มีเฉพาะ wire type 2
3. **ค่า** ตัวเลขเก็บเป็น varint คือใช้ byte ละ 7 bit ตัวเลขเล็กเลยกินแค่ byte เดียว

ลองแก้ค่าในช่องด้านล่าง แล้วดู bytes เปลี่ยนตาม

===notes===

## กติกาที่ห้ามพลาด

- **ห้ามเปลี่ยน field number** ของ field ที่ใช้งานอยู่แล้ว client เวอร์ชันเก่าจะอ่านข้อมูลผิดทันที
- ลบ field ทิ้งได้ แต่ต้องใส่ `reserved` กันไว้ คนที่มาทีหลังจะได้ไม่เอาเลขเดิมไปใช้ซ้ำ
- เพิ่ม field ใหม่ได้ตลอด ฝั่งที่ยังไม่รู้จัก field นั้นจะข้ามไปเฉย ๆ ตรงนี้แหละที่ทำให้ deploy client กับ server แยกกันได้
- field ที่ไม่ได้ตั้งค่าจะอ่านออกมาเป็นค่าเริ่มต้น (`""`, `0`, `false`) ถ้าต้องแยกให้ออกว่า "ไม่ได้ตั้ง" กับ "ตั้งเป็นค่าว่าง" ให้ใช้ `optional`
- เลข field 1 ถึง 15 ใช้ tag แค่ byte เดียว เก็บเลขกลุ่มนี้ไว้ให้ field ที่ส่งบ่อย
- เงินเก็บเป็นจำนวนเต็มหน่วยสตางค์หรือเซนต์ (`int64 price_cents`) อย่าใช้ `double`

## type ที่ใช้บ่อย

| ใน .proto | Go | TypeScript | Python | C# |
|---|---|---|---|---|
| `string` | `string` | `string` | `str` | `string` |
| `int32` / `int64` | `int32` / `int64` | `number` | `int` | `int` / `long` |
| `bool` | `bool` | `boolean` | `bool` | `bool` |
| `bytes` | `[]byte` | `Uint8Array` | `bytes` | `ByteString` |
| `repeated T` | `[]T` | `T[]` | list-like | `RepeatedField<T>` |
| `map<K,V>` | `map[K]V` | `Record<K,V>` | dict-like | `MapField<K,V>` |
