import type { HighlighterCore } from '@shikijs/core';

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
        import('@shikijs/core'),
        import('@shikijs/engine-javascript'),
      ]);
      return createHighlighterCore({
        themes: [import('@shikijs/themes/github-light'), import('@shikijs/themes/github-dark')],
        langs: [
          import('@shikijs/langs/proto'),
          import('@shikijs/langs/go'),
          import('@shikijs/langs/typescript'),
          import('@shikijs/langs/python'),
          import('@shikijs/langs/csharp'),
          import('@shikijs/langs/bash'),
          import('@shikijs/langs/yaml'),
          import('@shikijs/langs/json'),
          import('@shikijs/langs/xml'),
        ],
        engine: createJavaScriptRegexEngine(),
      });
    })();
  }
  return highlighterPromise;
}

const cache = new Map<string, string>();

export async function highlight(code: string, lang: string): Promise<string> {
  const key = lang + '\u0000' + code;
  const hit = cache.get(key);
  if (hit) return hit;
  const hl = await getHighlighter();
  const known = hl.getLoadedLanguages().includes(lang) ? lang : 'text';
  const html = hl.codeToHtml(code, {
    lang: known,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
  });
  cache.set(key, html);
  return html;
}
