pip install grpcio grpcio-tools

# --pyi_out adds type stubs so your editor can autocomplete fields
python -m grpc_tools.protoc -I proto \
  --python_out=gen --pyi_out=gen \
  --grpc_python_out=gen \
  proto/shop/v1/shop.proto

# -> gen/shop/v1/shop_pb2.py       (messages)
# -> gen/shop/v1/shop_pb2_grpc.py  (OrderServiceServicer, OrderServiceStub)

# The files form the package shop.v1, so import them like this
# (with gen/ on the path, e.g. PYTHONPATH=gen python server.py):
#   from shop.v1 import shop_pb2, shop_pb2_grpc
