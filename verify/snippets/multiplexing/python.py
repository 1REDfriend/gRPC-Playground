import asyncio
import grpc
import shop_pb2, shop_pb2_grpc


async def main():
    # One channel, created once, shared by every call
    async with grpc.aio.insecure_channel("orders.internal:50051") as channel:
        stub = shop_pb2_grpc.OrderServiceStub(channel)
        orders = await asyncio.gather(*[
            stub.GetOrder(shop_pb2.GetOrderRequest(order_id=oid))
            for oid in ("A-1001", "A-1002", "A-1003")
        ])
        print([o.status for o in orders])

asyncio.run(main())
