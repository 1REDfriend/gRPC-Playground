import type { Lang, TopicMeta, TopicModule } from '../lib/types';
import { parseTopicText, type TopicText } from '../lib/markdown';

export const topics: TopicMeta[] = [
  { slug: 'what-is-grpc', group: 'basics' },
  { slug: 'protobuf', group: 'basics' },
  { slug: 'codegen', group: 'basics' },
  { slug: 'unary', group: 'rpc' },
  { slug: 'server-streaming', group: 'rpc' },
  { slug: 'client-streaming', group: 'rpc' },
  { slug: 'bidi-streaming', group: 'rpc' },
  { slug: 'multiplexing', group: 'features' },
  { slug: 'metadata', group: 'features' },
  { slug: 'deadlines', group: 'features' },
  { slug: 'errors', group: 'features' },
  { slug: 'interceptors', group: 'features' },
  { slug: 'retries-keepalive', group: 'production' },
  { slug: 'load-balancing', group: 'production' },
  { slug: 'tls', group: 'production' },
  { slug: 'health-reflection', group: 'production' },
  { slug: 'grpc-web', group: 'production' },
];

const texts = import.meta.glob<string>('./topics/*/*.md', { query: '?raw', import: 'default', eager: true });
const modules = import.meta.glob<{ default: TopicModule }>('./topics/*/topic.ts', { eager: true });

const parsed = new Map<string, TopicText>();

export function topicText(slug: string, lang: Lang): TopicText {
  const key = `${slug}/${lang}`;
  let hit = parsed.get(key);
  if (!hit) {
    const raw = texts[`./topics/${slug}/${lang}.md`] ?? texts[`./topics/${slug}/en.md`] ?? `# ${slug}`;
    hit = parseTopicText(raw);
    parsed.set(key, hit);
  }
  return hit;
}

export function topicModule(slug: string): TopicModule | undefined {
  return modules[`./topics/${slug}/topic.ts`]?.default;
}
