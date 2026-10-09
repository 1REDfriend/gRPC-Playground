# Generated into gen/shop/v1/, so put gen/ on PYTHONPATH
from shop.v1 import shop_pb2

item = shop_pb2.Item(sku="SKU-1007", quantity=150)

data = item.SerializeToString()      # bytes
print(data.hex())

decoded = shop_pb2.Item.FromString(data)
print(decoded.sku, decoded.quantity)

# Unset scalar fields read as their default value, never None
print(decoded.price_cents)           # 0
