"use client";

import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
const THEME_KEY = 'datahunter.theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function apply(value: string | null) {
      const next: Theme = value === 'light' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      setTheme(next);
    }
    try { apply(localStorage.getItem(THEME_KEY)); } catch { apply(null); }
    setReady(true);
    const sync = (event: StorageEvent) => { if (event.key === THEME_KEY || event.key === null) apply(event.newValue); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* The current page still switches when storage is unavailable. */ }
  }

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return <button type="button" className="theme-toggle" onClick={toggle} disabled={!ready} aria-label={label} title={label}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {theme === 'dark' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></> : <path d="M20.5 13a8.5 8.5 0 0 1-9.5-9.5A8.5 8.5 0 1 0 20.5 13Z" />}
    </svg>
    <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
  </button>;
}
