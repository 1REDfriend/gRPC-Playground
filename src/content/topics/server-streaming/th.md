# Server streaming
> ส่ง request ไปครั้งเดียว แล้ว server ทยอยส่งข้อมูลกลับมาเรื่อย ๆ จนกว่าจะหมด

ลองนึกถึงหน้าติดตามพัสดุ ถ้าเป็น REST ทั่วไป client ต้องคอยถาม server ซ้ำทุกไม่กี่วินาทีว่า "เปลี่ยนสถานะหรือยัง" แบบนี้เปลือง request แล้วยังได้ข้อมูลช้ากว่าความจริงอีกด้วย

server streaming แก้ปัญหานี้ตรง ๆ client เรียก `WatchOrder` ครั้งเดียว stream จะเปิดค้างไว้ พอสถานะ order เปลี่ยน server ก็ส่ง `OrderEvent` กลับมาทันที ใน `.proto` แค่เติมคำว่า `stream` หน้า type ที่ส่งกลับ

```proto
rpc WatchOrder(WatchOrderRequest) returns (stream OrderEvent);
```

ในแผนภาพจะเห็นว่า response ไม่ได้มาเป็นก้อนเดียว แต่เป็น DATA หลาย frame บน stream เดิม และ TRAILERS มาตอนท้ายสุดครั้งเดียว ลองปรับจำนวน event แล้วกดเล่นใหม่

===notes===

## สิ่งที่ควรจำ

- ฝั่ง client อ่านทีละ message ใน loop ได้เลย ไม่ต้องรอให้ server ส่งครบก่อน
- loop ฝั่ง client จบเมื่อ server ปิด stream ใน Go จะได้ `io.EOF` ใน Python iterator จะหมด ใน Node.js จะมี event `end`
- server ต้องคอยเช็กว่า client ยังอยู่ไหม (`stream.Context().Done()`, `context.is_active()`, `CancellationToken`) ไม่อย่างนั้นจะส่งข้อมูลให้คนที่ปิดแอปไปแล้ว
- stream ที่เปิดค้างนาน ๆ ควรตั้ง deadline ให้ยาวพอ หรือไม่ตั้งเลยแล้วไปพึ่ง keepalive แทน (ดูบท Retry และ Keepalive)
- ตัวอย่างอื่นที่เข้ากับรูปแบบนี้ เช่น ราคาหุ้นแบบ real-time, ส่งผลลัพธ์ query ขนาดใหญ่ทีละส่วน, ส่ง token ของ LLM ทีละคำ
