export type Lang = 'th' | 'en';

/** A string that exists in every UI language. */
export type L = Record<Lang, string>;

export type FrameKind =
  | 'headers'
  | 'data'
  | 'trailers'
  | 'error'
  | 'ping'
  | 'tls'
  | 'http'
  | 'note';

export interface SimEvent {
  /** Start time in simulation milliseconds. */
  at: number;
  /** Travel time across the wire; ignored for notes. Defaults to 650. */
  dur?: number;
  from: string;
  to: string;
  kind: FrameKind;
  /** Short wire-level label, shown on the arrow (kept in English: it mirrors protocol names). */
  label: string;
  /** Raw frame / payload text shown in the inspector. */
  detail?: string;
  /** Human explanation shown in the event log. */
  note?: L;
  /** HTTP/2 stream id; used to colour concurrent streams. */
  stream?: number;
}

export interface Actor {
  id: string;
  label: L;
}

export interface RangeControl {
  kind: 'range';
  id: string;
  label: L;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
}

export interface SelectControl {
  kind: 'select';
  id: string;
  label: L;
  default: string;
  options: { value: string; label: L }[];
}

export type Control = RangeControl | SelectControl;

export type Params = Record<string, string | number>;

export interface Scenario {
  actors: Actor[];
  events: SimEvent[];
  /** Optional verdict shown when playback finishes. */
  outcome?: { ok: boolean; text: L };
}

export interface SimSpec {
  title?: L;
  controls?: Control[];
  build: (params: Params) => Scenario;
}

export type CodeTabId = 'proto' | 'go' | 'node' | 'python' | 'csharp' | 'shell' | 'config' | 'browser';

export interface CodeTab {
  id: CodeTabId;
  /** Shiki language id. */
  lang: string;
  /** Overrides the default tab label. */
  label?: string;
  code: string;
}

export type WidgetId = 'size-compare' | 'proto-encoder' | 'codegen-flow';

export interface TopicModule {
  slug: string;
  sim?: SimSpec;
  widget?: WidgetId;
  code?: CodeTab[];
}

export interface TopicMeta {
  slug: string;
  group: 'basics' | 'rpc' | 'features' | 'production';
}
