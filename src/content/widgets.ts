import type { L } from '../lib/types';

// Copy used by the interactive widgets on the first three chapters.
export const widgetText = {
  sizeTitle: { th: 'ขนาดข้อมูล: JSON เทียบกับ Protobuf', en: 'Payload size: JSON vs Protobuf' },
  sizeItems: { th: 'จำนวนสินค้าใน order', en: 'Items in the order' },
  sizeJson: { th: 'JSON (REST)', en: 'JSON (REST)' },
  sizeProto: { th: 'Protobuf (gRPC)', en: 'Protobuf (gRPC)' },
  sizeSmaller: { th: 'เล็กกว่า JSON', en: 'smaller than JSON' },
  sizeNote: {
    th: 'ตัวเลขนี้คำนวณจริงในเบราว์เซอร์ของคุณ JSON ต้องส่งชื่อ field ซ้ำทุกครั้ง ส่วน Protobuf ส่งแค่เลข field กับค่า',
    en: 'Both numbers are computed live in your browser. JSON repeats every field name; Protobuf sends a field number and the value.',
  },
  sizeShowJson: { th: 'ดู JSON', en: 'Show JSON' },
  sizeShowHex: { th: 'ดู bytes ของ Protobuf', en: 'Show Protobuf bytes' },

  encTitle: { th: 'ลองเข้ารหัส message เอง', en: 'Encode a message yourself' },
  encBytes: { th: 'bytes ที่ส่งจริงบนสาย', en: 'Bytes on the wire' },
  encTotal: { th: 'รวม', en: 'Total' },
  encDefaults: {
    th: 'ค่าว่าง เลข 0 และ false ไม่ถูกส่งเลย ลองลบ sku หรือตั้ง quantity เป็น 0 แล้วดู bytes หายไป',
    en: 'Empty strings, zeros and false are not sent at all. Clear the sku or set quantity to 0 and watch the bytes disappear.',
  },
  roleTag: { th: 'tag (เลข field + ชนิด)', en: 'tag (field number + wire type)' },
  roleLen: { th: 'ความยาว', en: 'length' },
  roleValue: { th: 'ค่า', en: 'value' },

  flowTitle: { th: 'จาก .proto ไปเป็นโค้ด', en: 'From .proto to code' },
  flowSource: { th: 'สัญญากลาง', en: 'The shared contract' },
  flowTool: { th: 'compiler + plugin ของแต่ละภาษา', en: 'compiler + per-language plugin' },
  flowOut: { th: 'โค้ดที่ได้', en: 'Generated code' },
  flowYou: {
    th: 'คุณเขียนแค่ logic ใน handler กับโค้ดฝั่งที่เรียก ส่วนการแปลงข้อมูล การส่ง และ type ทั้งหมดมาจากโค้ดที่ generate',
    en: 'You only write handler logic and the calling code. Serialization, transport and types all come from the generated code.',
  },
} satisfies Record<string, L>;
