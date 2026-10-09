import type { L } from '../lib/types';

// UI chrome copy. Topic prose lives in src/content/topics/<slug>/{th,en}.md.
export const ui = {
  siteName: { th: 'gRPC Playground', en: 'gRPC Playground' },
  tagline: {
    th: 'เรียน gRPC จากของจริง ดู message วิ่งไปมา แล้วเปิดโค้ดที่ทำให้มันเกิดขึ้น',
    en: 'Learn gRPC by watching messages move, then read the code that makes them move.',
  },
  groupBasics: { th: 'พื้นฐาน', en: 'Basics' },
  groupRpc: { th: 'รูปแบบการเรียก RPC', en: 'RPC types' },
  groupFeatures: { th: 'กลไกที่ควรรู้', en: 'Core mechanics' },
  groupProduction: { th: 'ขึ้น production', en: 'Production' },
  home: { th: 'หน้าแรก', en: 'Home' },
  simulation: { th: 'ลองเล่น', en: 'Simulation' },
  howToWrite: { th: 'เขียนโค้ดยังไง', en: 'How to write it' },
  play: { th: 'เล่น', en: 'Play' },
  pause: { th: 'หยุด', en: 'Pause' },
  step: { th: 'ทีละขั้น', en: 'Step' },
  reset: { th: 'เริ่มใหม่', en: 'Reset' },
  speed: { th: 'ความเร็ว', en: 'Speed' },
  eventLog: { th: 'ลำดับเหตุการณ์', en: 'Event log' },
  inspector: { th: 'เนื้อในของ frame', en: 'Frame inspector' },
  inspectorEmpty: {
    th: 'กด “เล่น” หรือ “ทีละขั้น” แล้วรายละเอียดของ frame ล่าสุดจะขึ้นตรงนี้',
    en: 'Press Play or Step and the latest frame shows up here.',
  },
  logEmpty: { th: 'ยังไม่มีอะไรเกิดขึ้น', en: 'Nothing has happened yet.' },
  copy: { th: 'คัดลอก', en: 'Copy' },
  copied: { th: 'คัดลอกแล้ว', en: 'Copied' },
  next: { th: 'บทถัดไป', en: 'Next' },
  prev: { th: 'บทก่อนหน้า', en: 'Previous' },
  startLearning: { th: 'เริ่มจากบทแรก', en: 'Start with chapter one' },
  menu: { th: 'เมนู', en: 'Menu' },
  themeLight: { th: 'โหมดสว่าง', en: 'Light mode' },
  themeDark: { th: 'โหมดมืด', en: 'Dark mode' },
  notFound: { th: 'ไม่เจอหน้านี้', en: 'Page not found' },
  legendTitle: { th: 'สีของ frame', en: 'Frame colours' },
  homeHow: {
    th: 'ทุกบทมีสามส่วน อ่านคำอธิบายสั้น ๆ กดเล่น simulation ดูว่าข้อมูลเดินทางยังไง แล้วเปิดโค้ดภาษาที่คุณใช้ ทั้ง Go, Node.js, Python และ C#',
    en: 'Every chapter has three parts: a short explanation, a simulation you can play and poke at, and the code behind it in Go, Node.js, Python and C#.',
  },
  example: {
    th: 'ทั้งเว็บใช้ตัวอย่างเดียวกันคือ OrderService ของร้านค้าออนไลน์ โค้ดแต่ละบทเลยต่อกันได้',
    en: 'The whole site uses one running example, an online shop’s OrderService, so code from one chapter carries over to the next.',
  },
} satisfies Record<string, L>;

export const frameKindLabel: Record<string, L> = {
  headers: { th: 'HEADERS (metadata)', en: 'HEADERS (metadata)' },
  data: { th: 'DATA (message)', en: 'DATA (message)' },
  trailers: { th: 'TRAILERS (สถานะปิดท้าย)', en: 'TRAILERS (final status)' },
  error: { th: 'error', en: 'error' },
  ping: { th: 'PING (keepalive)', en: 'PING (keepalive)' },
  tls: { th: 'TLS handshake', en: 'TLS handshake' },
  http: { th: 'HTTP/1.1', en: 'HTTP/1.1' },
};
