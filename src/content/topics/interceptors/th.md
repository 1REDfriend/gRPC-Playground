# Interceptor (middleware)
> โค้ดที่ครอบทุก call ไว้ ทำงานก่อนและหลัง handler เหมาะกับงานที่ทุก method ต้องทำเหมือนกัน

ลองนับดูว่าแต่ละ method ต้องทำอะไรซ้ำกันบ้าง ตรวจ token, เขียน log, จับเวลา, ส่ง metric, แนบ trace id ถ้าเขียนเรื่องพวกนี้ใน handler ทุกตัว โค้ดจะซ้ำเต็มไปหมด และสักวันก็ต้องมีสักที่ที่ลืมใส่

interceptor แก้ปัญหานี้ด้วยการเป็นชั้นที่ห่อ handler ไว้ คล้าย middleware ของ Express หรือ ASP.NET แต่ละชั้นทำงานของตัวเองแล้วเรียก `next` (หรือ `handler`, `continuation` แล้วแต่ภาษา) ส่งต่อให้ชั้นถัดไป ขากลับก็ไล่ย้อนผ่านชั้นเดิม

ลองเลือก "ไม่มี token" ดู ชั้น Auth จะตอบ error กลับไปเลยโดยไม่เรียก `next` handler จึงไม่ถูกเรียกแม้แต่ครั้งเดียว ส่วน Logging ที่อยู่ชั้นนอกสุดก็ยังได้บันทึกผลอยู่ดี

===notes===

## สิ่งที่ควรจำ

- **ลำดับสำคัญ** ใส่ logging กับ tracing ไว้นอกสุด จะได้เห็นทุก call รวมถึงตัวที่ auth ปฏิเสธ
- interceptor มีทั้งฝั่ง server และฝั่ง client ฝั่ง client มักใช้แนบ token, ใส่ trace context หรือ retry
- unary กับ streaming ใช้ interceptor คนละแบบ ใน Go มี `UnaryServerInterceptor` กับ `StreamServerInterceptor` แยกกัน ถ้าลงทะเบียนแค่แบบเดียว method ที่เป็น stream จะหลุดจาก auth ไปเลย
- ไม่ต้องเขียนเองทุกอย่าง มีของสำเร็จรูปให้ใช้ เช่น `go-grpc-middleware` ใน Go หรือ OpenTelemetry ที่มี interceptor สำหรับ tracing ให้แทบทุกภาษา
- ใน .NET งาน auth ใช้ middleware ของ ASP.NET Core ได้เลย แล้วเก็บ interceptor ไว้ทำงานที่เกี่ยวกับ gRPC โดยตรง
