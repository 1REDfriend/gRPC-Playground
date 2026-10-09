// A deliberately small Markdown renderer for our own content files.
// Supports: ## / ### headings, paragraphs, - and 1. lists, > callouts,
// | tables |, ``` fenced code, `inline code`, **bold**, [links](url).

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(s: string): string {
  const parts = s.split(/(`[^`]+`)/g);
  return parts
    .map((part) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      return escapeHtml(part)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) => {
          const external = /^https?:/.test(href);
          return `<a href="${href}"${external ? ' target="_blank" rel="noreferrer"' : ''}>${text}</a>`;
        });
    })
    .join('');
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      out.push(`<pre class="md-code" data-lang="${escapeHtml(lang)}"><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        '<div class="table-wrap"><table><thead><tr>' +
          head.map((c) => `<th>${inline(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table></div>',
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      const itemRe = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
      while (i < lines.length && itemRe.test(lines[i])) {
        let item = lines[i].replace(itemRe, '');
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !itemRe.test(lines[i])) {
          item += ' ' + lines[i].trim();
          i++;
        }
        items.push(`<li>${inline(item)}</li>`);
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    if (line.startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<aside class="callout">${inline(body.join(' '))}</aside>`);
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{2,3}\s|```|\||>|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }

  return out.join('\n');
}

export interface TopicText {
  title: string;
  summary: string;
  intro: string;
  notes: string;
}

/** Splits a topic file: `# Title`, `> summary`, intro, then `===notes===`, notes. */
export function parseTopicText(src: string): TopicText {
  const text = src.replace(/\r\n/g, '\n').trim();
  const [head, notes = ''] = text.split(/\n===notes===\n/);
  const lines = head.split('\n');
  let title = '';
  let summary = '';
  let start = 0;
  if (lines[0]?.startsWith('# ')) {
    title = lines[0].slice(2).trim();
    start = 1;
  }
  while (lines[start]?.trim() === '') start++;
  if (lines[start]?.startsWith('> ')) {
    summary = lines[start].slice(2).trim();
    start++;
  }
  return { title, summary, intro: lines.slice(start).join('\n').trim(), notes: notes.trim() };
}
