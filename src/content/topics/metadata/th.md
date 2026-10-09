# Metadata (headers และ trailers)
> ข้อมูลประกอบที่แนบไปกับ call แต่ไม่ได้อยู่ใน message เช่น token, request id, ค่าสำหรับ trace

บางข้อมูลไม่ได้เป็นส่วนหนึ่งของ "สิ่งที่ขอ" แต่จำเป็นต่อการทำงาน อย่าง token ที่บอกว่าใครเป็นคนเรียก หรือ request id ที่ใช้ตามหา log ข้อมูลพวกนี้ไม่ควรไปปนอยู่ใน `GetOrderRequest` ทุกตัว gRPC เลยมีช่องแยกไว้ให้ เรียกว่า **metadata** เป็นคู่ key กับ value แบบเดียวกับ HTTP header

metadata ส่งได้สามจังหวะ ลองกดเล่นแล้วดูว่าแต่ละตัวโผล่ใน frame ไหน

1. **request metadata** ไปกับ HEADERS ของ client ก่อน message
2. **response header** ไปกับ HEADERS ของ server ก่อน message ตอบกลับ
3. **response trailer** ไปกับ TRAILERS ตอนจบ เหมาะกับค่าที่จะรู้ก็ต่อเมื่อทำงานเสร็จแล้ว เช่น เวลาที่ใช้ query

===notes===

## กติกาของ key

- key เป็นตัวพิมพ์เล็กเสมอ ถึงคุณจะตั้งเป็น `Authorization` ก็จะกลายเป็น `authorization`
- key ที่ลงท้ายด้วย `-bin` เก็บค่าเป็น binary ได้ ระบบจะ encode เป็น base64 ให้เองตอนส่ง
- key ที่ขึ้นต้นด้วย `grpc-` สงวนไว้ให้ตัว gRPC เอง อย่าตั้งชื่อชนกัน
- ขนาด metadata ทั้งหมดถูกจำกัดไว้ (ค่าเริ่มต้นมักอยู่ที่ราว 8 KB) อย่าเอาข้อมูลก้อนใหญ่มาใส่

## ใช้ metadata ทำอะไรบ้าง

- ส่ง token สำหรับ authentication
- ส่ง request id หรือ trace context (`traceparent`) ให้ทุก service log ด้วย id เดียวกัน
- บอกเวอร์ชันของแอปฝั่ง client ให้ server ตัดสินใจเรื่อง feature flag
- server ตอบค่าที่ client อาจอยากรู้ เช่น rate limit ที่เหลือ หรือ pod ที่ตอบ

งานแบบนี้มักทำซ้ำทุก method การเขียนโค้ดอ่าน metadata ในทุก handler เลยไม่ใช่ทางที่ดี บทเรื่อง interceptor จะแสดงวิธีย้ายไปทำในจุดเดียว
