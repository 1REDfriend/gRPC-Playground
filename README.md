# gRPC Playground

Live site: https://1redfriend.github.io/gRPC-Playground/

A bilingual (Thai / English) documentation site for learning gRPC. Every chapter has a short explanation, an animated in-browser simulation of the frames on the wire, and the code that produces that behaviour in Go, Node.js, Python and C#.

Everything runs in the browser. There is no backend; the simulations are scripted scenarios, and the Protobuf byte views are computed live by a small encoder in `src/lib/protobuf.ts`.

## Run it

```bash
npm install
npm run dev
```

| Command | Port | What |
|---|---|---|
| `npm run dev` | **41873** | Vite dev server: http://localhost:41873 |
| `npm run preview` | **41874** | Serves the production build from `dist/` |
| `npm run build` | | Type-checks, then builds a static site into `dist/` |

The build uses relative paths and hash routing, so `dist/` can be served from any static host or sub-folder.

## Chapters

1. What is gRPC (JSON vs Protobuf size widget)
2. Protocol Buffers (live wire-format encoder)
3. Generating code from `.proto`
4. Unary RPC
5. Server streaming
6. Client streaming
7. Bidirectional streaming
8. HTTP/2 multiplexing
9. Metadata (headers and trailers)
10. Deadlines and cancellation
11. Status codes and errors
12. Interceptors
13. Retries and keepalive
14. Load balancing
15. TLS and mTLS
16. Health checks and reflection
17. gRPC-Web

## Layout

```
src/
  content/
    index.ts              chapter order + loaders
    shared.ts             shop.proto and frame helpers used by scenarios
    widgets.ts            copy for the three widgets
    topics/<slug>/
      th.md, en.md        prose: "# Title", "> summary", intro, "===notes===", notes
      topic.ts            simulation scenario + code tabs
  components/
    Simulator/            engine (timeline), SequenceDiagram (SVG), Simulator (controls, log, inspector)
    widgets/              SizeCompare, ProtoEncoder, CodegenFlow
    CodeTabs.tsx          language tabs; the chosen language is remembered across pages
  i18n/                   language context + UI strings
  lib/                    types, tiny Markdown renderer, Shiki highlighter, Protobuf encoder
```

## Adding a chapter

1. Add `{ slug, group }` to `topics` in `src/content/index.ts`.
2. Create `src/content/topics/<slug>/th.md` and `en.md`.
3. Create `src/content/topics/<slug>/topic.ts` exporting a `TopicModule` with an optional `sim` (a `build(params)` that returns actors and timed events) and `code` tabs.

All user-facing text lives in `src/content/**` and `src/i18n/ui.ts`; components contain no copy.
