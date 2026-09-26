import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Home as HomeIcon, Music2, Sparkles, AlarmClock, SlidersHorizontal, Cpu, Moon, Sun, Monitor } from 'lucide-react';
import { useNexus } from './DeviceContext';
import PlayerBar from './components/PlayerBar';
import AlarmRinging from './components/AlarmRinging';
import Home from './pages/Home';
import Music from './pages/Music';
import Assistant from './pages/Assistant';
import Alarms from './pages/Alarms';
import Device from './pages/Device';
import System from './pages/System';

export const PAGES = [
  { id: 'home', label: 'Home', icon: HomeIcon, component: Home },
  { id: 'music', label: 'Music', icon: Music2, component: Music },
  { id: 'assistant', label: 'Assistant', icon: Sparkles, component: Assistant },
  { id: 'alarms', label: 'Alarms', icon: AlarmClock, component: Alarms },
  { id: 'device', label: 'Device', icon: SlidersHorizontal, component: Device },
  { id: 'system', label: 'System', icon: Cpu, component: System },
];

const pageFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return PAGES.some((p) => p.id === id) ? id : 'home';
};

export const navigate = (id) => {
  window.location.hash = `/${id}`;
};

const THEMES = ['system', 'dark', 'light'];
const THEME_ICONS = { system: Monitor, dark: Moon, light: Sun };

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('nexus_theme') || 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('nexus_theme', theme);
    } catch {
      // Not persisted.
    }
  }, [theme]);
  const cycle = () => setTheme((t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]);
  return [theme, cycle];
}

function ConnectionBadge() {
  const { online, host } = useNexus();
  return (
    <div className={clsx('conn', online ? 'conn-on' : 'conn-off')} title={online ? `Connected to ${host}` : `Can't reach ${host}`}>
      <span className="conn-dot" />
      <span className="conn-text">{online ? 'Online' : 'Offline'}</span>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState(pageFromHash);
  const [theme, cycleTheme] = useTheme();
  const { snapshot } = useNexus();

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.querySelector('.main')?.scrollTo?.(0, 0);
  }, [page]);

  const Current = PAGES.find((p) => p.id === page).component;
  const ThemeIcon = THEME_ICONS[theme];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">N</div>
          <div className="brand-text">
            <span className="brand-name">Nexus</span>
            <span className="brand-sub">ESP32-S3 speaker</span>
          </div>
        </div>
        <nav className="nav">
          {PAGES.map((p) => (
            <a key={p.id} href={`#/${p.id}`} className={clsx('nav-item', page === p.id && 'is-active')}>
              <p.icon size={18} />
              <span>{p.label}</span>
              {p.id === 'music' && snapshot.music.queue_length > 0 && (
                <span className="nav-count">{snapshot.music.queue_length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <ConnectionBadge />
          <button className="icon-btn" onClick={cycleTheme} title={`Theme: ${theme}`} aria-label={`Theme: ${theme}`}>
            <ThemeIcon size={17} />
          </button>
        </div>
      </aside>

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">N</div>
          <span className="brand-name">Nexus</span>
        </div>
        <div className="topbar-right">
          <ConnectionBadge />
          <button className="icon-btn" onClick={cycleTheme} title={`Theme: ${theme}`} aria-label={`Theme: ${theme}`}>
            <ThemeIcon size={17} />
          </button>
        </div>
      </header>

      <main className="main">
        <div className="page">
          {(snapshot.alarm.ringing || snapshot.alarm.state === 'snoozed') && <AlarmRinging alarm={snapshot.alarm} />}
          <Current />
        </div>
      </main>

      <PlayerBar />

      <nav className="tabbar">
        {PAGES.map((p) => (
          <a key={p.id} href={`#/${p.id}`} className={clsx('tab', page === p.id && 'is-active')}>
            <p.icon size={20} />
            <span>{p.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
