# Load balancing
> connection ที่เปิดค้างไว้ทำให้การกระจายโหลดแบบเดิมใช้ไม่ได้ ต้องคิดใหม่ว่าจะ balance ที่ไหน

ปัญหาแรกที่หลายทีมเจอตอนย้ายมาใช้ gRPC บน Kubernetes คือ scale เพิ่มเป็นสามตัวแล้ว แต่ตัวเดียวทำงานหนักอยู่ตัวเดียว อีกสองตัวนั่งว่าง

ต้นเหตุคือ multiplexing ที่เราชอบกันในบทก่อน client เปิด connection แค่เส้นเดียวแล้วส่งทุก call ผ่านเส้นนั้น load balancer ที่ทำงานในระดับ TCP (L4) อย่าง Service ปกติของ Kubernetes จะเลือก backend แค่ตอนเปิด connection หลังจากนั้นทุก call ก็ไหลไปตัวเดิมตลอด

ทางแก้มีสองแบบ

- **balance ฝั่ง client** ให้ client resolve ชื่อออกมาเป็นทุก IP แล้วเปิด connection ไปหาทุกตัว จากนั้นกระจาย call เองด้วย `round_robin` ไม่ต้องมีอะไรคั่นกลาง เลยเร็ว
- **ใช้ proxy ที่เข้าใจ HTTP/2 (L7)** เช่น Envoy, Linkerd, Istio หรือ NGINX ที่ตั้งค่าเป็น gRPC proxy ตัวนี้กระจายงานเป็นราย call แทนราย connection

ลองสลับระหว่าง `pick_first` ซึ่งเป็นค่าเริ่มต้น กับ `round_robin` แล้วดูว่า call ทั้งหกตัวไปลงที่ไหน

===notes===

## สิ่งที่ควรจำ

- ใส่ `dns:///` นำหน้า target เพื่อให้ client resolve ได้ทุก IP ถ้าไม่ใส่ บางภาษาจะใช้แค่ IP แรกที่เจอ
- บน Kubernetes ต้องใช้ headless Service (`clusterIP: None`) DNS ถึงจะคืน IP ของทุก pod กลับมา
- DNS ไม่ได้อัปเดตตัวเองทันที ตอน pod ถูกเพิ่มหรือลบ client จะ resolve ใหม่ก็ต่อเมื่อ connection หลุด server ช่วยได้ด้วยการตั้ง `MaxConnectionAge` (หรือค่าคล้ายกันในภาษาอื่น) ให้ client ต่อใหม่เป็นระยะ จะได้เห็น pod ใหม่
- ระบบใหญ่ที่มีหลายสิบ service มักใช้ service mesh หรือ xDS (control plane ของ Envoy) แทน เพราะสั่งนโยบายได้จากจุดเดียว ไม่ต้องไปแก้โค้ดของทุก client
