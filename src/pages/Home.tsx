import { Link } from 'react-router-dom';
import { topics, topicText } from '../content';
import { useLang } from '../i18n/LangContext';
import { ui } from '../i18n/ui';

export function Home() {
  const { lang, t } = useLang();
  return (
    <article className="doc home">
      <h1>{t(ui.siteName)}</h1>
      <p className="lede">{t(ui.tagline)}</p>
      <p>{t(ui.homeHow)}</p>
      <p className="muted">{t(ui.example)}</p>
      <Link to={`/${topics[0].slug}`} className="btn primary big">
        {t(ui.startLearning)} →
      </Link>
      <div className="cards">
        {topics.map((tp, i) => {
          const text = topicText(tp.slug, lang);
          return (
            <Link key={tp.slug} to={`/${tp.slug}`} className="card">
              <span className="card-num">{String(i + 1).padStart(2, '0')}</span>
              <b>{text.title}</b>
              <span className="muted small">{text.summary}</span>
            </Link>
          );
        })}
      </div>
    </article>
  );
}
