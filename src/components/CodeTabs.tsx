import { useEffect, useState } from 'react';
import type { CodeTab, CodeTabId } from '../lib/types';
import { readPref, writePref } from '../lib/prefs';
import { CodeBlock } from './CodeBlock';

const DEFAULT_LABEL: Record<CodeTabId, string> = {
  proto: '.proto',
  go: 'Go',
  node: 'Node.js',
  python: 'Python',
  csharp: 'C#',
  shell: 'Shell',
  config: 'Config',
  browser: 'Browser',
};

const listeners = new Set<(id: string) => void>();

// The chosen language follows the reader across every code block on every page.
function useSharedTab(): [string, (id: string) => void] {
  const [tab, setTab] = useState<string>(() => readPref('code-tab') ?? 'go');
  useEffect(() => {
    listeners.add(setTab);
    return () => {
      listeners.delete(setTab);
    };
  }, []);
  const choose = (id: string) => {
    writePref('code-tab', id);
    listeners.forEach((fn) => fn(id));
  };
  return [tab, choose];
}

export function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [preferred, choose] = useSharedTab();
  const [local, setLocal] = useState<string | null>(null);
  const active =
    tabs.find((tab) => tab.id === local) ?? tabs.find((tab) => tab.id === preferred) ?? tabs[0];

  return (
    <div className="code-tabs">
      <div className="tab-row" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active.id}
            className={tab.id === active.id ? 'tab active' : 'tab'}
            onClick={() => {
              setLocal(null);
              if (tab.id === 'proto' || tab.id === 'shell' || tab.id === 'config' || tab.id === 'browser') {
                setLocal(tab.id);
              } else {
                choose(tab.id);
              }
            }}
          >
            {tab.label ?? DEFAULT_LABEL[tab.id]}
          </button>
        ))}
      </div>
      <CodeBlock code={active.code} lang={active.lang} />
    </div>
  );
}
