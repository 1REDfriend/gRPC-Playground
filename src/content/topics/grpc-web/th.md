# gRPC-Web: เรียกจากเบราว์เซอร์
> เบราว์เซอร์คุย gRPC ตรง ๆ ไม่ได้ gRPC-Web กับ proxy ตัวเล็ก ๆ จะช่วยแปลงให้

ถึงตรงนี้ทุกตัวอย่างเป็น server คุยกับ server หรือแอปที่คุม network ได้เต็มที่ แต่ถ้าอยากเรียก `OrderService` จาก React หรือ Vue ในเบราว์เซอร์ล่ะ?

ติดอยู่สองเรื่อง เรื่องแรก JavaScript ในเบราว์เซอร์ไม่มี API ให้คุม HTTP/2 frame เอง เรื่องที่สองหนักกว่า เบราว์เซอร์อ่าน HTTP trailers ไม่ได้ ทั้งที่ gRPC ส่ง `grpc-status` มากับ trailers พอขาดตรงนี้ไปก็ไม่มีทางรู้เลยว่า call สำเร็จหรือพัง

**gRPC-Web** คือโปรโตคอลที่ดัดแปลงมาให้เบราว์เซอร์ใช้ได้ ส่งผ่าน `fetch` ธรรมดา ส่วน trailers ถูกย้ายไปไว้ท้าย body แล้วมี proxy อย่าง Envoy คอยแปลงไปกลับระหว่าง gRPC-Web กับ gRPC จริง

ลองกด "ทีละขั้น" แล้วดู frame สุดท้ายที่ proxy ส่งให้เบราว์เซอร์ ใน body มีทั้ง message และ trailer frame ต่อกันอยู่

===notes===

## สิ่งที่ควรจำ

- gRPC-Web รองรับแค่ unary กับ server streaming **ส่วน client streaming และ bidi ใช้ไม่ได้** เพราะ `fetch` ในเบราว์เซอร์ยังส่ง request body เป็น stream ได้ไม่ครบทุกตัว
- server ฝั่ง ASP.NET Core รองรับ gRPC-Web ในตัว ไม่ต้องมี proxy ส่วนภาษาอื่นมักใช้ Envoy วางไว้ข้างหน้า
- ใน Go ถ้าไม่อยากมี proxy ก็ใช้ connect-go ที่ตอบได้ทั้ง gRPC, gRPC-Web และ Connect protocol จาก handler ตัวเดียว
- ฝั่งเบราว์เซอร์ตอนนี้นิยมใช้ Connect-ES (`@connectrpc/connect-web`) มากกว่า `grpc-web` ตัวเดิม เพราะได้ TypeScript type ครบและใช้ `async/await` ได้ตามปกติ
- อย่าลืม CORS ต้อง expose header `grpc-status` กับ `grpc-message` ด้วย ไม่อย่างนั้นโค้ดฝั่งเบราว์เซอร์จะอ่าน error ไม่ออก

## จบแล้ว ไปต่อทางไหนดี

ลองเอา `shop.proto` ไป generate โค้ดในภาษาที่คุณใช้ เขียน `GetOrder` ให้รันได้จริง แล้วค่อยเติม streaming, deadline และ interceptor เข้าไปทีละอย่าง ใช้ `grpcurl` ยิงทดสอบไปเรื่อย ๆ เอกสารฉบับเต็มอยู่ที่ [grpc.io](https://grpc.io/docs/)
