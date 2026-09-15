'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './icons';
import { visibleNav, type NavItem } from './nav-links';

interface PersonHit { id: string; firstName: string; lastName: string; email: string | null; jobTitle: string | null }

/**
 * Ricerca rapida (CORE-064): ⌘K / Ctrl+K apre le pagine e trova le persone per nome o email.
 * Le persone arrivano dal route handler /api/search, che interroga l'API con il token di sessione.
 */
export function CommandPalette({ permissions, canSearchPeople }: { permissions: string[]; canSearchPeople: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [idx, setIdx] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const pages = useMemo(() => visibleNav(permissions), [permissions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v); }
      else if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('wb:palette', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('wb:palette', onOpen); };
  }, []);
  useEffect(() => { if (open) { setQ(''); setPeople([]); setIdx(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  useEffect(() => {
    if (!open || !canSearchPeople || q.trim().length < 2) { setPeople([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal }).then((r) => (r.ok ? r.json() : { items: [] })).then((d: { items: PersonHit[] }) => setPeople(d.items ?? [])).catch(() => {});
    }, 160);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open, canSearchPeople]);

  const needle = q.trim().toLowerCase();
  const pageHits: NavItem[] = needle ? pages.filter((p) => p.label.toLowerCase().includes(needle)) : pages;
  const rows: { key: string; label: string; sub?: string; href: string; icon: NavItem['icon'] }[] = [
    ...pageHits.map((p) => ({ key: `p:${p.href}`, label: p.label, href: p.href, icon: p.icon })),
    ...people.map((p) => ({ key: `u:${p.id}`, label: `${p.firstName} ${p.lastName}`, sub: p.jobTitle ?? p.email ?? '', href: `/people?q=${encodeURIComponent(`${p.firstName} ${p.lastName}`)}`, icon: 'people' as const })),
  ];
  useEffect(() => { setIdx(0); }, [q, people.length]);
  const go = (href: string) => { setOpen(false); router.push(href); };
  if (!open) return null;
  return (
    <div className="palette-scrim" onMouseDown={() => setOpen(false)} role="presentation">
      <div className="palette" role="dialog" aria-modal="true" aria-label="Ricerca rapida" onMouseDown={(e) => e.stopPropagation()}>
        <div className="in">
          <Icon name="search" size={18} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={canSearchPeople ? 'Vai a una pagina o cerca una persona…' : 'Vai a una pagina…'} aria-label="Cerca"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(rows.length - 1, i + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
              else if (e.key === 'Enter' && rows[idx]) go(rows[idx].href);
            }} />
          <span className="kbd">Esc</span>
        </div>
        <div className="list" role="listbox">
          {pageHits.length > 0 && <div className="grp">Pagine</div>}
          {rows.slice(0, pageHits.length).map((r, i) => <Row key={r.key} r={r} on={i === idx} onHover={() => setIdx(i)} onGo={() => go(r.href)} />)}
          {people.length > 0 && <div className="grp">Persone</div>}
          {rows.slice(pageHits.length).map((r, j) => { const i = pageHits.length + j; return <Row key={r.key} r={r} on={i === idx} onHover={() => setIdx(i)} onGo={() => go(r.href)} />; })}
          {rows.length === 0 && <div className="empty">Nessun risultato per «{q}»</div>}
        </div>
      </div>
    </div>
  );
}

function Row({ r, on, onHover, onGo }: { r: { label: string; sub?: string; icon: NavItem['icon'] }; on: boolean; onHover: () => void; onGo: () => void }) {
  return (
    <div role="option" aria-selected={on} className={`it${on ? ' on' : ''}`} onMouseEnter={onHover} onClick={onGo}>
      <Icon name={r.icon} size={16} />
      <span>{r.label}</span>
      {r.sub && <small>{r.sub}</small>}
    </div>
  );
}

/** Pulsante «Cerca…» della sidebar: apre la palette. */
export function SearchButton() {
  return (
    <button type="button" className="searchbtn" onClick={() => window.dispatchEvent(new Event('wb:palette'))} aria-label="Ricerca rapida (Ctrl+K)">
      <Icon name="search" size={15} />
      <span>Cerca…</span>
      <span className="kbd">⌘K</span>
    </button>
  );
}
