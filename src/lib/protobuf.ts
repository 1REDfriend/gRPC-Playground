// Minimal protobuf wire-format encoder used by the teaching widgets.
// Only covers what the widgets need: varint, length-delimited and nested messages.

export type WireType = 0 | 2;

export interface Segment {
  role: 'tag' | 'len' | 'value';
  field: string;
  bytes: number[];
  /** Short English explanation of how the bytes were derived. */
  explain: string;
}

const utf8 = new TextEncoder();

export function varint(value: number | bigint): number[] {
  let v = BigInt.asUintN(64, BigInt(value));
  const out: number[] = [];
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    out.push(byte);
  } while (v > 0n);
  return out;
}

export function tag(fieldNumber: number, wire: WireType): number[] {
  return varint((fieldNumber << 3) | wire);
}

export function hex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

export function stringField(name: string, num: number, value: string): Segment[] {
  if (value === '') return []; // proto3 omits default values
  const body = Array.from(utf8.encode(value));
  return [
    { role: 'tag', field: name, bytes: tag(num, 2), explain: `(${num} << 3) | 2 = ${(num << 3) | 2}  → field ${num}, wire type 2 (LEN)` },
    { role: 'len', field: name, bytes: varint(body.length), explain: `length = ${body.length} bytes` },
    { role: 'value', field: name, bytes: body, explain: `UTF-8 of "${value}"` },
  ];
}

export function varintField(name: string, num: number, value: number | boolean): Segment[] {
  const n = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  if (n === 0) return [];
  return [
    { role: 'tag', field: name, bytes: tag(num, 0), explain: `(${num} << 3) | 0 = ${(num << 3) | 0}  → field ${num}, wire type 0 (VARINT)` },
    { role: 'value', field: name, bytes: varint(n), explain: `varint(${n}) — 7 bits per byte, high bit = "more bytes follow"` },
  ];
}

export function flatten(segments: Segment[]): number[] {
  return segments.flatMap((s) => s.bytes);
}

export function nested(num: number, inner: number[]): number[] {
  return [...tag(num, 2), ...varint(inner.length), ...inner];
}

// ---- Sample "Order" used by the size comparison widget ----

export interface SampleItem {
  sku: string;
  quantity: number;
  priceCents: number;
}

export interface SampleOrder {
  id: string;
  customerId: string;
  items: SampleItem[];
  totalCents: number;
  status: 'PAID';
}

export function sampleOrder(itemCount: number): SampleOrder {
  const items: SampleItem[] = Array.from({ length: itemCount }, (_, i) => ({
    sku: `SKU-${String(1000 + i * 7)}`,
    quantity: (i % 4) + 1,
    priceCents: 1990 + i * 250,
  }));
  return {
    id: 'A-1001',
    customerId: 'C-42',
    items,
    totalCents: items.reduce((sum, it) => sum + it.quantity * it.priceCents, 0),
    status: 'PAID',
  };
}

export function orderToProtobuf(order: SampleOrder): number[] {
  const STATUS_PAID = 2;
  const bytes: number[] = [
    ...flatten(stringField('id', 1, order.id)),
    ...flatten(stringField('customer_id', 2, order.customerId)),
  ];
  for (const item of order.items) {
    const inner = [
      ...flatten(stringField('sku', 1, item.sku)),
      ...flatten(varintField('quantity', 2, item.quantity)),
      ...flatten(varintField('price_cents', 3, item.priceCents)),
    ];
    bytes.push(...nested(3, inner));
  }
  bytes.push(...flatten(varintField('total_cents', 4, order.totalCents)));
  bytes.push(...flatten(varintField('status', 5, STATUS_PAID)));
  return bytes;
}

export function orderToJson(order: SampleOrder, pretty = false): string {
  return JSON.stringify(order, null, pretty ? 2 : undefined);
}

export function byteLength(s: string): number {
  return utf8.encode(s).length;
}
