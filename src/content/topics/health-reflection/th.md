# Health check และ Reflection
> service มาตรฐานสองตัวที่ทำให้ระบบอื่นรู้ว่าคุณพร้อมไหม และทำให้คนเรียก API ได้โดยไม่ต้องมีไฟล์ .proto

gRPC มี service สำเร็จรูปที่ทุกภาษาทำไว้ให้เหมือนกัน เพิ่มเข้า server ของคุณได้ในไม่กี่บรรทัด สองตัวที่ใช้บ่อยที่สุดคือ health กับ reflection

## Health check

`grpc.health.v1.Health` เป็นช่องทางมาตรฐานให้ Kubernetes, load balancer หรือระบบ monitor ถามว่า service พร้อมรับงานหรือยัง มีสอง method คือ `Check` ไว้ถามครั้งเดียว และ `Watch` ไว้เปิด stream ค้างให้ server แจ้งกลับเองเมื่อสถานะเปลี่ยน

ตัวที่ตัดสินว่า SERVING หรือ NOT_SERVING คือโค้ดของคุณ เช่น ถ้า connection pool ของ database เต็ม ก็เปลี่ยนเป็น NOT_SERVING ระบบด้านนอกจะหยุดส่งงานมาให้ pod นี้เอง

## Reflection

ปกติจะเรียก gRPC ได้ คุณต้องมีไฟล์ `.proto` อยู่ในมือ ซึ่งไม่สะดวกเลยเวลาจะลองยิง API เร็ว ๆ หรือ debug reflection แก้ตรงนี้ด้วยการให้ server ตอบ schema ของตัวเองได้ เครื่องมืออย่าง `grpcurl`, Postman หรือ grpcui จะถามเอาจาก server ได้เลย

ลองสลับดูทั้งสองโหมด

===notes===

## สิ่งที่ควรจำ

- Kubernetes ตั้งแต่ 1.24 ใช้ `grpc` เป็น probe ได้ตรง ๆ ไม่ต้องติดตั้ง `grpc_health_probe` เพิ่ม
- ถ้าส่งชื่อ service เป็นค่าว่าง (`""`) จะได้สถานะรวมของทั้ง server
- reflection เปิดเผย API ทั้งหมดของคุณ หลายทีมเปิดเฉพาะตอน dev หรือ staging หรือไม่ก็เปิดบน port ภายในที่คนนอกเข้าไม่ถึง
- `grpcurl` ใช้งานแทบเหมือน `curl` จะลองเรียก API ก็พิมพ์ JSON เข้าไปได้เลย แล้วผลก็กลับมาเป็น JSON ให้อ่านง่าย
