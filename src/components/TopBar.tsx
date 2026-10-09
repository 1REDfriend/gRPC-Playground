import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../i18n/LangContext';
import { ui } from '../i18n/ui';
import { readPref, writePref } from '../lib/prefs';

type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  const saved = readPref('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { lang, setLang, t } = useLang();
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writePref('theme', theme);
  }, [theme]);

  return (
    <header className="topbar">
      <button type="button" className="icon-btn menu-btn" aria-label={t(ui.menu)} onClick={onMenu}>
        ☰
      </button>
      <Link to="/" className="brand">
        <span className="logo" aria-hidden>
          <svg viewBox="0 0 32 32" width="26" height="26">
            <rect width="32" height="32" rx="8" className="logo-bg" />
            <path d="M8 11h16M8 16h10M8 21h16" className="logo-lines" />
          </svg>
        </span>
        {t(ui.siteName)}
      </Link>
      <div className="topbar-actions">
        <div className="seg lang-switch" role="group" aria-label="Language">
          <button type="button" className={lang === 'th' ? 'seg-btn active' : 'seg-btn'} onClick={() => setLang('th')}>
            ไทย
          </button>
          <button type="button" className={lang === 'en' ? 'seg-btn active' : 'seg-btn'} onClick={() => setLang('en')}>
            EN
          </button>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={theme === 'dark' ? t(ui.themeLight) : t(ui.themeDark)}
          title={theme === 'dark' ? t(ui.themeLight) : t(ui.themeDark)}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  );
}
