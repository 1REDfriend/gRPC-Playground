import { Link, useParams } from 'react-router-dom';
import { topicModule, topics, topicText } from '../content';
import { useLang } from '../i18n/LangContext';
import { ui } from '../i18n/ui';
import { renderMarkdown } from '../lib/markdown';
import type { WidgetId } from '../lib/types';
import { CodeTabs } from '../components/CodeTabs';
import { Simulator } from '../components/Simulator/Simulator';
import { SizeCompare } from '../components/widgets/SizeCompare';
import { ProtoEncoder } from '../components/widgets/ProtoEncoder';
import { CodegenFlow } from '../components/widgets/CodegenFlow';

const WIDGETS: Record<WidgetId, () => JSX.Element> = {
  'size-compare': SizeCompare,
  'proto-encoder': ProtoEncoder,
  'codegen-flow': CodegenFlow,
};

export function TopicPage() {
  const { slug = '' } = useParams();
  const { lang, t } = useLang();
  const index = topics.findIndex((tp) => tp.slug === slug);

  if (index < 0) {
    return (
      <article className="doc">
        <h1>{t(ui.notFound)}</h1>
        <Link to="/">{t(ui.home)}</Link>
      </article>
    );
  }

  const text = topicText(slug, lang);
  const mod = topicModule(slug);
  const prev = topics[index - 1];
  const next = topics[index + 1];
  const Widget = mod?.widget ? WIDGETS[mod.widget] : null;

  return (
    <article className="doc">
      <div className="eyebrow">
        {String(index + 1).padStart(2, '0')} / {topics.length}
      </div>
      <h1>{text.title}</h1>
      {text.summary && <p className="lede">{text.summary}</p>}

      <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(text.intro) }} />

      {Widget && <Widget />}

      {mod?.sim && (
        <>
          <h2 className="section-title">{mod.sim.title ? t(mod.sim.title) : t(ui.simulation)}</h2>
          <Simulator key={slug} spec={mod.sim} />
        </>
      )}

      {mod?.code && mod.code.length > 0 && (
        <>
          <h2 className="section-title">{t(ui.howToWrite)}</h2>
          <CodeTabs key={slug} tabs={mod.code} />
        </>
      )}

      {text.notes && <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(text.notes) }} />}

      <nav className="pager">
        {prev ? (
          <Link to={`/${prev.slug}`} className="pager-link">
            <small>← {t(ui.prev)}</small>
            {topicText(prev.slug, lang).title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={`/${next.slug}`} className="pager-link right">
            <small>{t(ui.next)} →</small>
            {topicText(next.slug, lang).title}
          </Link>
        )}
      </nav>
    </article>
  );
}
