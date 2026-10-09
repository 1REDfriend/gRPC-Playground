import type { L, SimEvent } from '../lib/types';
import { flatten, hex, stringField, varintField, type Segment } from '../lib/protobuf';

export const SHOP_PROTO = `syntax = "proto3";

package shop.v1;

option go_package = "example.com/shop/gen/shop/v1;shopv1";
option csharp_namespace = "Shop.V1";

service OrderService {
  // Unary: one request, one response.
  rpc GetOrder(GetOrderRequest) returns (Order);
  // Server streaming: one request, many responses.
  rpc WatchOrder(WatchOrderRequest) returns (stream OrderEvent);
  // Client streaming: many requests, one response.
  rpc UploadItems(stream Item) returns (UploadSummary);
  // Bidirectional streaming: both sides send whenever they like.
  rpc SupportChat(stream ChatMessage) returns (stream ChatMessage);
}

message GetOrderRequest { string order_id = 1; }

message Order {
  string id = 1;
  string customer_id = 2;
  repeated Item items = 3;
  int64 total_cents = 4;
  OrderStatus status = 5;
}

message Item {
  string sku = 1;
  int32 quantity = 2;
  int64 price_cents = 3;
}

enum OrderStatus {
  ORDER_STATUS_UNSPECIFIED = 0;
  ORDER_STATUS_PENDING = 1;
  ORDER_STATUS_PAID = 2;
  ORDER_STATUS_SHIPPED = 3;
  ORDER_STATUS_DELIVERED = 4;
}

message WatchOrderRequest { string order_id = 1; }
message OrderEvent { OrderStatus status = 1; string note = 2; }
message UploadSummary { int32 item_count = 1; int64 total_cents = 2; }
message ChatMessage { string from = 1; string text = 2; }`;

export const CLIENT = { id: 'client', label: { th: 'Client', en: 'Client' } };
export const SERVER = { id: 'server', label: { th: 'Server', en: 'Server' } };

export const l = (th: string, en: string): L => ({ th, en });

/** gRPC length-prefixed message: 1 byte compressed flag + 4 byte big-endian length + body. */
export function grpcFrame(segments: Segment[], name: string): string {
  const body = flatten(segments);
  const len = body.length;
  const prefix = [0, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255];
  return [
    `00              compressed-flag = 0`,
    `${hex(prefix.slice(1))}     message length = ${len}`,
    `${hex(body)}`,
    `                ${name}`,
  ].join('\n');
}

export const req = {
  getOrder: (id = 'A-1001') => stringField('order_id', 1, id),
  order: () => [
    ...stringField('id', 1, 'A-1001'),
    ...stringField('customer_id', 2, 'C-42'),
    ...varintField('total_cents', 4, 5970),
    ...varintField('status', 5, 2),
  ],
};

export function requestHeaders(method: string, extra: string[] = []): string {
  return [
    `:method = POST`,
    `:scheme = http`,
    `:path = /shop.v1.OrderService/${method}`,
    `:authority = orders.example.com`,
    `content-type = application/grpc`,
    `te = trailers`,
    ...extra,
  ].join('\n');
}

export const RESPONSE_HEADERS = `:status = 200\ncontent-type = application/grpc`;

export function trailers(code = 0, message = '', extra: string[] = []): string {
  return [`grpc-status = ${code}`, ...(message ? [`grpc-message = ${message}`] : []), ...extra].join('\n');
}

/** The five frames of a successful unary call, starting at `at`. */
export function unaryCall(opts: {
  at: number;
  from?: string;
  to?: string;
  method?: string;
  stream?: number;
  reqLabel?: string;
  respLabel?: string;
  gap?: number;
  notes?: Partial<Record<'headers' | 'data' | 'respHeaders' | 'respData' | 'trailers', L>>;
}): SimEvent[] {
  const { at, from = 'client', to = 'server', method = 'GetOrder', stream, gap = 450, notes = {} } = opts;
  return [
    { at, from, to, kind: 'headers', label: `HEADERS ${method}`, detail: requestHeaders(method), stream, note: notes.headers },
    {
      at: at + 250,
      from,
      to,
      kind: 'data',
      label: opts.reqLabel ?? 'DATA GetOrderRequest',
      detail: grpcFrame(req.getOrder(), 'GetOrderRequest{order_id:"A-1001"}'),
      stream,
      note: notes.data,
    },
    { at: at + 900 + gap, from: to, to: from, kind: 'headers', label: 'HEADERS :status 200', detail: RESPONSE_HEADERS, stream, note: notes.respHeaders },
    {
      at: at + 1150 + gap,
      from: to,
      to: from,
      kind: 'data',
      label: opts.respLabel ?? 'DATA Order',
      detail: grpcFrame(req.order(), 'Order{id:"A-1001", status:ORDER_STATUS_PAID, ...}'),
      stream,
      note: notes.respData,
    },
    { at: at + 1400 + gap, from: to, to: from, kind: 'trailers', label: 'TRAILERS grpc-status 0', detail: trailers(0), stream, note: notes.trailers },
  ];
}
