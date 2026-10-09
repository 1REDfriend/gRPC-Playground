// Dumps every code tab from the site's topic modules into verify/snippets/<slug>/<id>.<ext>
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ext = { go: 'go', typescript: 'ts', python: 'py', csharp: 'cs', proto: 'proto', bash: 'sh', yaml: 'yaml', json: 'json', xml: 'xml' };
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { topics, topicModule } = await server.ssrLoadModule('/src/content/index.ts');
const shared = await server.ssrLoadModule('/src/content/shared.ts');
mkdirSync(join(root, 'verify/proto/shop/v1'), { recursive: true });
writeFileSync(join(root, 'verify/proto/shop/v1/shop.proto'), shared.SHOP_PROTO + '\n');
for (const t of topics) {
  const mod = topicModule(t.slug);
  for (const tab of mod?.code ?? []) {
    const file = join(root, 'verify/snippets', t.slug, `${tab.id}.${ext[tab.lang] ?? 'txt'}`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, tab.code + '\n');
  }
}
await server.close();
console.log('done');
