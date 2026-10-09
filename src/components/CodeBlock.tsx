import { useEffect, useState } from 'react';
import { highlight } from '../lib/highlight';
import { useLang } from '../i18n/LangContext';
import { ui } from '../i18n/ui';

export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const { t } = useLang();
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setHtml(null);
    highlight(code, lang)
      .then((out) => alive && setHtml(out))
      .catch(() => alive && setHtml(null));
    return () => {
      alive = false;
    };
  }, [code, lang]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard can be blocked; nothing useful to do.
    }
  };

  return (
    <div className="code-block">
      <button type="button" className="copy-btn" onClick={copy}>
        {copied ? t(ui.copied) : t(ui.copy)}
      </button>
      {html ? (
        <div className="code-scroll" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="code-scroll">
          <pre className="shiki plain">
            <code>{code}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
