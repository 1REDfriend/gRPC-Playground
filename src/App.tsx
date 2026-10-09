import { useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Home } from './pages/Home';
import { TopicPage } from './pages/TopicPage';

export function App() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className={navOpen ? 'layout nav-open' : 'layout'}>
      <TopBar onMenu={() => setNavOpen((v) => !v)} />
      <Sidebar />
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <main className="content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/:slug" element={<TopicPage />} />
        </Routes>
      </main>
    </div>
  );
}
