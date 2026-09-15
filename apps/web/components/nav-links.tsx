'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './icons';

export interface NavItem { href: string; label: string; icon: IconName; perm?: string; anyPerm?: string[] }
export interface NavSection { title: string; items: NavItem[] }

/** Menu a sezioni (CORE-064, docs/07): le voci compaiono solo con il permesso del modulo. */
export const NAV_SECTIONS: NavSection[] = [
  { title: 'Il mio lavoro', items: [
    { href: '/dashboard', label: 'Home', icon: 'home' },
    { href: '/objectives', label: 'Obiettivi', icon: 'target' },
    { href: '/one-on-ones', label: '1:1', icon: 'one', perm: 'one_on_ones:participate' },
    { href: '/feedback', label: 'Feedback', icon: 'chat', perm: 'feedback:give' },
    { href: '/reviews', label: 'Review', icon: 'review', perm: 'reviews:participate' },
    { href: '/forms', label: 'Form', icon: 'form', perm: 'forms:respond' },
  ] },
  { title: 'Crescita', items: [
    { href: '/development', label: 'Sviluppo', icon: 'growth', anyPerm: ['development:use', 'development:manage'] },
    { href: '/f360', label: 'Feedback 360°', icon: 'f360', anyPerm: ['f360:participate', 'f360:manage'] },
    { href: '/surveys', label: 'Survey', icon: 'survey', anyPerm: ['surveys:respond', 'surveys:manage'] },
    { href: '/welfare', label: 'Welfare', icon: 'welfare', anyPerm: ['welfare:use', 'welfare:manage'] },
  ] },
  { title: 'Organizzazione', items: [
    { href: '/onboarding', label: 'Onboarding', icon: 'onb', anyPerm: ['onboarding:use', 'onboarding:manage'] },
    { href: '/apps', label: 'Processi', icon: 'flow', anyPerm: ['apps:use', 'apps:manage'] },
    { href: '/analytics', label: 'Report', icon: 'report', anyPerm: ['analytics:query', 'analytics:query:team'] },
    { href: '/people', label: 'Persone', icon: 'people', perm: 'people:read' },
  ] },
];
export const NAV_FOOTER: NavItem[] = [
  { href: '/inizia', label: 'Guida', icon: 'guide' },
  { href: '/notifications', label: 'Notifiche', icon: 'bell', perm: 'notifications:read' },
  { href: '/settings', label: 'Impostazioni', icon: 'settings' },
];

export const allowed = (i: NavItem, permissions: string[]) => (!i.perm || permissions.includes(i.perm)) && (!i.anyPerm || i.anyPerm.some((p) => permissions.includes(p)));
export const visibleNav = (permissions: string[]) => [...NAV_SECTIONS.flatMap((s) => s.items), ...NAV_FOOTER].filter((i) => allowed(i, permissions));

function Item({ i, on, count }: { i: NavItem; on: boolean; count?: number }) {
  return (
    <Link href={i.href} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
      <Icon name={i.icon} size={17} />
      <span>{i.label}</span>
      {count ? <span className="count" aria-label={`${count} non lette`}>{count}</span> : null}
    </Link>
  );
}

export function NavLinks({ permissions, unread = 0 }: { permissions: string[]; unread?: number }) {
  const path = usePathname();
  const isOn = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    <>
      <nav className="nav" aria-label="Sezioni">
        {NAV_SECTIONS.map((s) => {
          const items = s.items.filter((i) => allowed(i, permissions));
          if (!items.length) return null;
          return (
            <div key={s.title}>
              <div className="sec">{s.title}</div>
              {items.map((i) => <Item key={i.href} i={i} on={isOn(i.href)} />)}
            </div>
          );
        })}
      </nav>
      <nav className="foot" aria-label="Guida e impostazioni">
        {NAV_FOOTER.filter((i) => allowed(i, permissions)).map((i) => <Item key={i.href} i={i} on={isOn(i.href)} count={i.href === '/notifications' ? unread : undefined} />)}
      </nav>
    </>
  );
}

/** Percorso in testa alla pagina, derivato dalla sezione attiva. */
export function PageCrumb() {
  const path = usePathname();
  const all = [...NAV_SECTIONS.flatMap((s) => s.items), ...NAV_FOOTER];
  const section = all.find((i) => path === i.href || path.startsWith(`${i.href}/`));
  const rest = section ? path.slice(section.href.length).split('/').filter(Boolean) : [];
  const sub = rest[0] === 'new' ? 'Nuovo' : rest[0] === 'calibration' ? 'Calibrazione' : rest[0] === 'instances' ? 'Istanza' : rest[0] === 'templates' ? 'Modello' : rest[0] === 'users' ? 'Utenti e accessi' : rest[0] === 'import' ? 'Importa' : rest[0] === 'design' ? 'Guida di stile' : rest.length ? 'Dettaglio' : null;
  return (
    <div className="crumb" aria-label="Percorso">
      {section ? (sub ? <><span>{section.label}</span><Icon name="chev" size={13} stroke={2} /><b>{sub}</b></> : <b>{section.label}</b>) : <b>WorkingBetter</b>}
    </div>
  );
}
