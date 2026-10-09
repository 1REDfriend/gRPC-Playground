import { NavLink } from 'react-router-dom';
import { topics, topicText } from '../content';
import { useLang } from '../i18n/LangContext';
import { ui } from '../i18n/ui';
import type { TopicMeta } from '../lib/types';

const GROUPS: { id: TopicMeta['group']; label: keyof typeof ui }[] = [
  { id: 'basics', label: 'groupBasics' },
  { id: 'rpc', label: 'groupRpc' },
  { id: 'features', label: 'groupFeatures' },
  { id: 'production', label: 'groupProduction' },
];

export function Sidebar() {
  const { lang, t } = useLang();
  return (
    <nav className="sidebar">
      <NavLink to="/" end className="nav-link home-link">
        {t(ui.home)}
      </NavLink>
      {GROUPS.map((g) => (
        <div key={g.id} className="nav-group">
          <div className="nav-group-title">{t(ui[g.label])}</div>
          {topics
            .filter((tp) => tp.group === g.id)
            .map((tp) => (
              <NavLink key={tp.slug} to={`/${tp.slug}`} className="nav-link">
                <span className="nav-num">{topics.indexOf(tp) + 1}</span>
                {topicText(tp.slug, lang).title}
              </NavLink>
            ))}
        </div>
      ))}
    </nav>
  );
}
