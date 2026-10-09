# Option A: load the .proto at runtime (no build step, loosely typed)
npm install @grpc/grpc-js @grpc/proto-loader
#   protoLoader.loadSync('proto/shop/v1/shop.proto')  -> see the Unary chapter

# Option B: generate static code ahead of time with grpc-tools
npm install --save-dev grpc-tools
npx grpc_tools_node_protoc -I proto \
  --js_out=import_style=commonjs,binary:gen \
  --grpc_out=grpc_js:gen \
  proto/shop/v1/shop.proto
# -> gen/shop/v1/shop_pb.js and gen/shop/v1/shop_grpc_pb.js
