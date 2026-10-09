import type { TopicModule } from '../../../lib/types';

const topic: TopicModule = {
  slug: 'codegen',
  widget: 'codegen-flow',
  code: [
    {
      id: 'go',
      lang: 'bash',
      code: `# 1. Install the compiler (protoc) from your package manager, then the two Go plugins
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

# 2. Generate: messages -> shop.pb.go, service stubs -> shop_grpc.pb.go
protoc -I proto \\
  --go_out=gen --go_opt=paths=source_relative \\
  --go-grpc_out=gen --go-grpc_opt=paths=source_relative \\
  proto/shop/v1/shop.proto

# 3. Runtime dependency
go get google.golang.org/grpc`,
    },
    {
      id: 'node',
      lang: 'bash',
      code: `# Option A: load the .proto at runtime (no build step, loosely typed)
npm install @grpc/grpc-js @grpc/proto-loader
#   protoLoader.loadSync('proto/shop/v1/shop.proto')  -> see the Unary chapter

# Option B: generate static code ahead of time with grpc-tools
npm install --save-dev grpc-tools
npx grpc_tools_node_protoc -I proto \\
  --js_out=import_style=commonjs,binary:gen \\
  --grpc_out=grpc_js:gen \\
  proto/shop/v1/shop.proto
# -> gen/shop/v1/shop_pb.js and gen/shop/v1/shop_grpc_pb.js`,
    },
    {
      id: 'python',
      lang: 'bash',
      code: `pip install grpcio grpcio-tools

# --pyi_out adds type stubs so your editor can autocomplete fields
python -m grpc_tools.protoc -I proto \\
  --python_out=gen --pyi_out=gen \\
  --grpc_python_out=gen \\
  proto/shop/v1/shop.proto

# -> gen/shop/v1/shop_pb2.py       (messages)
# -> gen/shop/v1/shop_pb2_grpc.py  (OrderServiceServicer, OrderServiceStub)`,
    },
    {
      id: 'csharp',
      lang: 'xml',
      code: `<!-- Server project: dotnet add package Grpc.AspNetCore -->
<ItemGroup>
  <Protobuf Include="Protos\\shop.proto" GrpcServices="Server" />
</ItemGroup>

<!-- Client project:
       dotnet add package Google.Protobuf
       dotnet add package Grpc.Net.Client
       dotnet add package Grpc.Tools -->
<ItemGroup>
  <Protobuf Include="..\\Protos\\shop.proto" GrpcServices="Client" />
</ItemGroup>

<!-- Grpc.Tools runs protoc on every build; there is no separate command to remember. -->`,
    },
    {
      id: 'config',
      lang: 'yaml',
      label: 'buf.gen.yaml',
      code: `# buf replaces long protoc commands with a config file.
# Run: buf generate   (and: buf lint, buf breaking --against '.git#branch=main')
version: v2
plugins:
  - remote: buf.build/protocolbuffers/go
    out: gen/go
    opt: paths=source_relative
  - remote: buf.build/grpc/go
    out: gen/go
    opt: paths=source_relative
  - remote: buf.build/protocolbuffers/python
    out: gen/python
  - remote: buf.build/grpc/python
    out: gen/python`,
    },
  ],
};

export default topic;
