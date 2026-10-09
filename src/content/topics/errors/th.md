# Status code และการจัดการ error
> ทุก call จบด้วย status code หนึ่งในสิบเจ็ดตัว เลือกให้ถูก ฝั่ง client ก็ตัดสินใจถูก

ใน REST เรามี HTTP status อย่าง 404 หรือ 500 ส่วน gRPC มี status code ของตัวเองสิบเจ็ดตัว ส่งกลับมาใน `grpc-status` พร้อมข้อความอธิบายใน `grpc-message`

ในแผนภาพจะเห็นอีกเรื่องที่น่าสนใจ ตอนเกิด error server ไม่ส่ง DATA กลับมาเลย ส่งแค่ HEADERS ที่มีสถานะแล้วปิด stream ทันที รูปแบบนี้มีชื่อเรียกว่า Trailers-Only ส่วน HTTP status ก็ยังเป็น `200` อยู่ดี เพราะในระดับ HTTP ทุกอย่างปกติ ที่ผิดคือตัว call

ลองเลือก error แต่ละแบบ แล้วสังเกตว่าฝั่ง client ควรรับมือต่างกันยังไง

===notes===

## status code ที่ใช้บ่อย

| code | ชื่อ | ใช้ตอนไหน | retry ได้ไหม |
|---|---|---|---|
| 0 | `OK` | สำเร็จ | |
| 1 | `CANCELLED` | client ยกเลิกเอง | ไม่ |
| 3 | `INVALID_ARGUMENT` | ข้อมูลที่ส่งมาผิด ไม่ว่าระบบอยู่ในสถานะไหนก็ผิด | ไม่ |
| 4 | `DEADLINE_EXCEEDED` | หมดเวลา | ได้ ถ้าเรียกซ้ำได้ปลอดภัย |
| 5 | `NOT_FOUND` | ไม่มีข้อมูลที่ขอ | ไม่ |
| 6 | `ALREADY_EXISTS` | สร้างซ้ำของที่มีอยู่แล้ว | ไม่ |
| 7 | `PERMISSION_DENIED` | รู้ว่าเป็นใคร แต่ไม่มีสิทธิ์ | ไม่ |
| 8 | `RESOURCE_EXHAUSTED` | ติด rate limit หรือ quota | ได้ แต่ต้องรอ |
| 9 | `FAILED_PRECONDITION` | สถานะของระบบไม่พร้อม เช่น ยกเลิก order ที่ส่งไปแล้ว | ไม่ ต้องแก้สถานะก่อน |
| 10 | `ABORTED` | ชนกับ transaction อื่น | ได้ ทั้ง transaction |
| 12 | `UNIMPLEMENTED` | server ยังไม่มี method นี้ | ไม่ |
| 13 | `INTERNAL` | bug ฝั่ง server | ไม่ |
| 14 | `UNAVAILABLE` | ปลายทางล่มชั่วคราว | ได้ พร้อม backoff |
| 16 | `UNAUTHENTICATED` | ไม่มี token หรือ token ไม่ถูกต้อง | ไม่ ต้องขอ token ใหม่ก่อน |

ตัวที่เหลือคือ `UNKNOWN` (2), `OUT_OF_RANGE` (11) และ `DATA_LOSS` (15)

## รายละเอียดที่มากกว่าข้อความ

ถ้าข้อความอย่างเดียวไม่พอ เช่นอยากบอกว่า field ไหนผิด ให้ใช้ rich error model ของ Google แนบ `google.rpc.Status` ที่มี `BadRequest`, `RetryInfo` หรือ `ErrorInfo` ไปใน trailer `grpc-status-details-bin` ฝั่ง client จะอ่านออกมาเป็น object ที่มี type ได้ ไม่ต้องไป parse ข้อความเอง

> อย่าส่ง stack trace หรือข้อความ error ดิบจาก database กลับไปให้ client ใน `INTERNAL` ให้ log ไว้ฝั่ง server แล้วส่งข้อความกลาง ๆ กลับไปพอ
