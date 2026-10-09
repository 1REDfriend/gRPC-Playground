# 1. Install the compiler (protoc) from your package manager, then the two Go plugins
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

# 2. Generate: messages -> shop.pb.go, service stubs -> shop_grpc.pb.go
protoc -I proto \
  --go_out=gen --go_opt=paths=source_relative \
  --go-grpc_out=gen --go-grpc_opt=paths=source_relative \
  proto/shop/v1/shop.proto

# 3. Runtime dependency
go get google.golang.org/grpc
