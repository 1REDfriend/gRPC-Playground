# Retry และ Keepalive
> ให้ library ลองใหม่เองเมื่อเจอความล้มเหลวชั่วคราว และคอยเช็กว่า connection ยังไม่ตาย

ระบบจริงพังแบบชั่วคราวอยู่ตลอด pod กำลัง restart, network สะดุดไปครึ่งวินาที, database สลับเครื่อง ถ้าทุก error แบบนี้ต้องเด้งไปถึงผู้ใช้ ระบบจะดูพังบ่อยกว่าความจริงมาก

## Retry

gRPC retry ให้อัตโนมัติได้ผ่าน **service config** ซึ่งเป็น JSON ที่บอกว่า method ไหน retry ได้กี่ครั้ง รอนานแค่ไหน และ status code ไหนบ้างที่ควรลองใหม่ โค้ดของคุณเรียก `GetOrder` แบบเดิม ถ้าครั้งแรกล้มแต่ครั้งที่สามสำเร็จ โค้ดของคุณจะไม่รู้ด้วยซ้ำว่ามีการลองใหม่

ระยะเวลาที่รอเพิ่มขึ้นเป็นเท่าตัวทุกรอบ (exponential backoff) และมีการสุ่มบวกลบ (jitter) ไม่ให้ client นับพันตัวกลับมายิงพร้อมกันจนล้ม server ซ้ำอีกรอบ

## Keepalive

connection ที่เปิดค้างไว้บางทีก็ตายเงียบ ๆ เช่น NAT หรือ load balancer ตัดทิ้งเพราะเห็นว่าว่างนาน ฝั่ง client จะไม่รู้เลย จนกว่าจะมี call ถัดไปที่ค้างรอจนหมด deadline keepalive แก้ด้วยการส่ง HTTP/2 PING เป็นระยะ ถ้าไม่ได้ ACK กลับมาในเวลาที่กำหนดก็ปิด connection นั้นแล้วเปิดใหม่

ลองสลับดูทั้งสองโหมด ในโหมด Retry ลองปรับจำนวนครั้งที่ server พังเป็น 4 ดูด้วย

===notes===

## ข้อควรระวัง

- **retry เฉพาะ method ที่เรียกซ้ำได้อย่างปลอดภัย** (idempotent) `GetOrder` retry ได้สบาย แต่ `ChargeCard` ถ้า retry มั่ว ๆ ลูกค้าอาจโดนตัดเงินสองรอบ ถ้าจำเป็นต้อง retry ให้ส่ง idempotency key ไปใน request ด้วย
- ใส่แค่ status ที่เป็นปัญหาชั่วคราวใน `retryableStatusCodes` ส่วนใหญ่คือ `UNAVAILABLE` อย่างเดียว อย่าใส่ `INVALID_ARGUMENT` หรือ `INTERNAL`
- retry ทุกครั้งยังอยู่ภายใต้ deadline เดิม ถ้า deadline หมดก่อน การ retry ก็หยุด
- ตั้ง keepalive ฝั่ง client แล้ว ต้องไปอนุญาตฝั่ง server ด้วย ไม่อย่างนั้น server จะมองว่า client ping ถี่เกินแล้วตัด connection ทิ้งพร้อม error `too_many_pings`
- library เวอร์ชันใหม่ ๆ เปิด retry ไว้ตั้งแต่ต้นแล้ว สิ่งที่ต้องทำมีแค่ใส่ service config ถ้าใช้เวอร์ชันเก่าแล้ว retry ไม่ทำงาน ให้ลองเช็ก option `grpc.enable_retries`
