'use client';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from './icons';

/**
 * Involucro dell'app (docs/07): sidebar fissa su desktop, cassetto a scomparsa sotto i 900px.
 * Il colore primario del tenant arriva come variabile CSS (--brand) e tinge tutte le derivate.
 */
export function AppShell({ sidebar, topbar, brandColor, children }: { sidebar: ReactNode; topbar: ReactNode; brandColor?: string | null; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const style = brandColor ? ({ '--brand': brandColor } as CSSProperties) : undefined;
  return (
    <div className={`app${open ? ' nav-open' : ''}`} style={style}>
      <a href="#main" className="skip">Vai al contenuto</a>
      <aside className="side" id="sidebar" aria-label="Navigazione principale">{sidebar}</aside>
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden />
      <header className="top">
        <button type="button" className="burger" aria-label={open ? 'Chiudi il menu' : 'Apri il menu'} aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen((v) => !v)}>
          <Icon name={open ? 'x' : 'menu'} size={18} />
        </button>
        {topbar}
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
