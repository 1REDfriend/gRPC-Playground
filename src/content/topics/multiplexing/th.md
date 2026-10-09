# HTTP/2 multiplexing
> หลาย call วิ่งพร้อมกันบน connection เดียว ตัวที่ช้าไม่ขวางตัวอื่น

gRPC ทำงานบน HTTP/2 เสมอ และฟีเจอร์ของ HTTP/2 ที่ gRPC ได้ประโยชน์มากที่สุดคือ **multiplexing** ทุก call จะได้ stream ของตัวเอง มีหมายเลขกำกับ (1, 3, 5, ...) frame ของหลาย stream สลับกันวิ่งบน TCP connection เดียวได้โดยไม่ปนกัน

แล้วถ้าเป็น HTTP/1.1 ล่ะ? connection หนึ่งรับได้ทีละ request ต้องรอ response ของตัวก่อนหน้ากลับมาก่อน ตัวถัดไปถึงจะได้ไป ถ้าตัวแรกช้า ทุกตัวที่ต่อคิวก็ช้าตามหมด อาการนี้เรียกว่า head-of-line blocking เบราว์เซอร์แก้ด้วยการเปิดหลาย connection พร้อมกัน แต่แต่ละ connection ก็มีต้นทุน handshake ของตัวเอง

ลองสลับระหว่าง HTTP/1.1 กับ HTTP/2 ข้างล่าง ทั้งสองแบบส่ง request สามตัวเหมือนกัน ตัวแรกใช้เวลาประมวลผลนานสุด

===notes===

## ผลที่ตามมาในโค้ด

- **สร้าง channel หรือ client ครั้งเดียวแล้วใช้ซ้ำ** อย่าสร้างใหม่ทุก request เพราะจะเสีย handshake ทุกครั้งและทิ้งข้อดีของ multiplexing ไปทั้งหมด
- channel ปลอดภัยเมื่อเรียกจากหลาย thread หรือ goroutine พร้อมกัน แชร์ทั้งแอปได้เลย
- server มักจำกัดจำนวน stream พร้อมกันต่อ connection ไว้ (ค่าที่เจอบ่อยคือ 100) ถ้ายิงเยอะกว่านั้นจะต้องรอคิว ใน .NET เปิด `EnableMultipleHttp2Connections` เพื่อให้เปิด connection เพิ่มเองได้
- HTTP/2 ยังบีบอัด header ด้วย HPACK ด้วย header ที่ซ้ำกันทุก call อย่าง `:path` หรือ `content-type` จึงแทบไม่กินพื้นที่ในครั้งต่อ ๆ ไป

> multiplexing แก้ head-of-line blocking ได้แค่ระดับ HTTP ถ้า TCP packet หาย ทุก stream บน connection นั้นก็ยังต้องรอ packet ที่ส่งซ้ำอยู่ดี ปัญหานี้ HTTP/3 (QUIC) ถึงจะแก้ได้
