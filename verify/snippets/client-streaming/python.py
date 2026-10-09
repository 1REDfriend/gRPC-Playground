# Server: request_iterator yields each Item as it arrives
class OrderService(shop_pb2_grpc.OrderServiceServicer):
    def UploadItems(self, request_iterator, context):
        count, total = 0, 0
        for item in request_iterator:
            count += 1
            total += item.quantity * item.price_cents
        return shop_pb2.UploadSummary(item_count=count, total_cents=total)


# Client: pass any iterator; the generator ending is the half-close
def items():
    for sku, qty, price in cart:
        yield shop_pb2.Item(sku=sku, quantity=qty, price_cents=price)

summary = stub.UploadItems(items())
print(summary.item_count, summary.total_cents)
