import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { L, Lang } from '../lib/types';
import { readPref, writePref } from '../lib/prefs';

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (text: L) => string;
}

const LangContext = createContext<LangState | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (readPref('lang') === 'en' ? 'en' : 'th'));

  useEffect(() => {
    writePref('lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<LangState>(() => ({ lang, setLang, t: (text) => text[lang] }), [lang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangState {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside LangProvider');
  return ctx;
}
