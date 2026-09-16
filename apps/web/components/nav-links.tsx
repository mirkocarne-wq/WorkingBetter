'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isModuleEnabled, type ModuleSettings, type Naming, type NamingConcept, type TenantModule } from '@wb/shared';
import { Icon, type IconName } from './icons';

export interface NavItem { href: string; label: string; icon: IconName; perm?: string; anyPerm?: string[]; module?: TenantModule; concept?: NamingConcept }
export interface NavSection { title: string; items: NavItem[] }
/** Personalizzazione del tenant applicata al menu: moduli spenti (CORE-004) e glossario (CORE-003). */
export interface NavContext { modules?: ModuleSettings | null; naming?: Naming | null }

/** Menu a sezioni (CORE-064, docs/07): le voci compaiono solo con il permesso del modulo e se il modulo è attivo. */
export const NAV_SECTIONS: NavSection[] = [
  { title: 'Il mio lavoro', items: [
    { href: '/dashboard', label: 'Home', icon: 'home' },
    { href: '/objectives', label: 'Obiettivi', icon: 'target', module: 'okr', concept: 'objective' },
    { href: '/one-on-ones', label: '1:1', icon: 'one', perm: 'one_on_ones:participate', module: 'one_on_ones', concept: 'one_on_one' },
    { href: '/feedback', label: 'Feedback', icon: 'chat', perm: 'feedback:give', module: 'feedback', concept: 'feedback' },
    { href: '/reviews', label: 'Review', icon: 'review', perm: 'reviews:participate', module: 'reviews', concept: 'review' },
    { href: '/forms', label: 'Form', icon: 'form', perm: 'forms:respond' },
  ] },
  { title: 'Crescita', items: [
    { href: '/development', label: 'Sviluppo', icon: 'growth', anyPerm: ['development:use', 'development:manage'], module: 'development' },
    { href: '/f360', label: 'Feedback 360°', icon: 'f360', anyPerm: ['f360:participate', 'f360:manage'], module: 'f360' },
    { href: '/surveys', label: 'Survey', icon: 'survey', anyPerm: ['surveys:respond', 'surveys:manage'], module: 'surveys' },
    { href: '/welfare', label: 'Welfare', icon: 'welfare', anyPerm: ['welfare:use', 'welfare:manage'], module: 'welfare' },
  ] },
  { title: 'Organizzazione', items: [
    { href: '/onboarding', label: 'Onboarding', icon: 'onb', anyPerm: ['onboarding:use', 'onboarding:manage'], module: 'onboarding' },
    { href: '/apps', label: 'Processi', icon: 'flow', anyPerm: ['apps:use', 'apps:manage'], module: 'apps', concept: 'process' },
    { href: '/analytics', label: 'Report', icon: 'report', anyPerm: ['analytics:query', 'analytics:query:team'], module: 'analytics' },
    { href: '/people', label: 'Persone', icon: 'people', perm: 'people:read' },
  ] },
];
export const NAV_FOOTER: NavItem[] = [
  { href: '/inizia', label: 'Guida', icon: 'guide' },
  { href: '/notifications', label: 'Notifiche', icon: 'bell', perm: 'notifications:read' },
  { href: '/settings', label: 'Impostazioni', icon: 'settings' },
];

export const allowed = (i: NavItem, permissions: string[], ctx?: NavContext) =>
  (!i.perm || permissions.includes(i.perm)) && (!i.anyPerm || i.anyPerm.some((p) => permissions.includes(p))) && (!i.module || isModuleEnabled({ modules: ctx?.modules }, i.module));
/** Etichetta della voce con il glossario del tenant (plurale del concetto). */
export const navLabel = (i: NavItem, ctx?: NavContext) => (i.concept && ctx?.naming?.[i.concept]?.plural) || i.label;
export const visibleNav = (permissions: string[], ctx?: NavContext) => [...NAV_SECTIONS.flatMap((s) => s.items), ...NAV_FOOTER].filter((i) => allowed(i, permissions, ctx)).map((i) => ({ ...i, label: navLabel(i, ctx) }));

function Item({ i, on, count }: { i: NavItem; on: boolean; count?: number }) {
  return (
    <Link href={i.href} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
      <Icon name={i.icon} size={17} />
      <span>{i.label}</span>
      {count ? <span className="count" aria-label={`${count} non lette`}>{count}</span> : null}
    </Link>
  );
}

export function NavLinks({ permissions, unread = 0, ctx }: { permissions: string[]; unread?: number; ctx?: NavContext }) {
  const path = usePathname();
  const isOn = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    <>
      <nav className="nav" aria-label="Sezioni">
        {NAV_SECTIONS.map((s) => {
          const items = s.items.filter((i) => allowed(i, permissions, ctx)).map((i) => ({ ...i, label: navLabel(i, ctx) }));
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
export function PageCrumb({ ctx }: { ctx?: NavContext }) {
  const path = usePathname();
  const all = [...NAV_SECTIONS.flatMap((s) => s.items), ...NAV_FOOTER];
  const section = all.find((i) => path === i.href || path.startsWith(`${i.href}/`));
  const label = section ? navLabel(section, ctx) : null;
  const rest = section ? path.slice(section.href.length).split('/').filter(Boolean) : [];
  const sub = rest[0] === 'new' ? 'Nuovo' : rest[0] === 'calibration' ? 'Calibrazione' : rest[0] === 'instances' ? 'Istanza' : rest[0] === 'templates' ? 'Modello' : rest[0] === 'users' ? 'Utenti e accessi' : rest[0] === 'import' ? 'Importa' : rest[0] === 'design' ? 'Guida di stile' : rest[0] === 'scales' ? 'Scale' : rest[0] === 'responses' ? 'Compilazione' : rest[0] === 'person-fields' ? 'Campi persona' : rest[0] === 'glossary' ? 'Glossario' : rest[0] === 'modules' ? 'Moduli' : rest[0] === 'roles' ? 'Ruoli e permessi' : rest.length ? 'Dettaglio' : null;
  return (
    <div className="crumb" aria-label="Percorso">
      {section ? (sub ? <><span>{label}</span><Icon name="chev" size={13} stroke={2} /><b>{sub}</b></> : <b>{label}</b>) : <b>WorkingBetter</b>}
    </div>
  );
}
