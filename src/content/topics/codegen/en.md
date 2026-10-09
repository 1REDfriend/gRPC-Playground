# Generating code from .proto
> Write the contract once and let tooling produce server and client code for every language.

You cannot run a `.proto` file. A compiler, `protoc`, reads it and hands it to a plugin for each language. You get two kinds of output:

- **Message code**: classes or structs whose fields match the `.proto`, plus functions to turn them into bytes and back.
- **Service code**: on the server, a base class or interface with methods waiting for your logic; on the client, a stub you can call straight away.

This is the big difference from writing an HTTP client by hand. If someone changes the `.proto` and your code uses a field wrong, the compiler tells you at build time instead of production telling you at 3 a.m.

===notes===

## Picking a tool

- **protoc** is plain and available everywhere, but the commands get long and you install plugins yourself.
- **buf** reads `buf.gen.yaml`, adds `buf lint` for style and `buf breaking` to check whether a `.proto` change would break existing clients. Teams with many services tend to end up here.
- **C#** uses `Grpc.Tools`, which hooks into `dotnet build`. Nothing extra to remember.
- **Node.js** can also load the `.proto` at runtime with `@grpc/proto-loader`. Quick to start, looser types.

## Lay out the files properly

Put each `.proto` in a folder that matches its package, like `proto/shop/v1/shop.proto`, and put a version in the package name (`shop.v1`). When you need a breaking change, you can ship `shop.v2` next to it without breaking anyone on v1.

Many teams keep their `.proto` files in one shared repo and let each service generate its own code from it, so everyone really is compiling against the same contract.
