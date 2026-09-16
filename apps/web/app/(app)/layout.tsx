import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError, apiFetch, MANUAL_URL, type Cycle, type Me } from '@/lib/api';
import { tenantContext } from '@/lib/tenant';
import { logout } from '@/lib/actions';
import { NavLinks, PageCrumb } from '@/components/nav-links';
import { AppShell } from '@/components/app-shell';
import { CommandPalette, SearchButton } from '@/components/command-palette';
import { Icon } from '@/components/icons';
import { Avatar } from '@/components/ui';

const shortDate = (iso: string) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(new Date(iso));

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let me: Me;
  let unread = 0;
  let cycle: Cycle | null = null;
  let tc: Awaited<ReturnType<typeof tenantContext>>;
  try {
    me = await apiFetch<Me>('/me');
    [unread, tc, cycle] = await Promise.all([
      apiFetch<{ count: number }>('/notifications/unread-count').then((r) => r.count).catch(() => 0),
      tenantContext(),
      apiFetch<Cycle | null>('/cycles/current').catch(() => null),
    ]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect('/login');
    throw e;
  }
  const { tenant, modules, naming } = tc;
  const ctx = { modules, naming };
  const name = me.person ? `${me.person.firstName} ${me.person.lastName}` : (me.user.email ?? 'Utente');
  const brand = tenant?.settings?.branding?.primaryColor ?? null;
  const tenantName = tenant?.name ?? 'WorkingBetter';
  return (
    <AppShell
      brandColor={brand}
      sidebar={
        <>
          <Link href="/dashboard" className="ws" title={tenantName}>
            <i aria-hidden>{tenantName[0]?.toUpperCase() ?? 'W'}</i>
            <div style={{ minWidth: 0, flex: 1 }}><div className="n">{tenantName}</div><div className="p">WorkingBetter</div></div>
          </Link>
          <SearchButton />
          <NavLinks permissions={me.permissions} unread={unread} ctx={ctx} />
          <div className="me">
            <Avatar person={me.person} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="n">{name}</div>
              <div className="r">{me.person?.jobTitle ?? me.user.roles.join(', ')}</div>
            </div>
            <form action={logout}><button className="iconbtn" title="Esci" aria-label="Esci"><Icon name="logout" size={17} /></button></form>
          </div>
        </>
      }
      topbar={
        <>
          <PageCrumb ctx={ctx} />
          <span className="sp" />
          {cycle && modules.okr !== false && <span className="chip" title={`Periodo attivo: ${cycle.startDate} – ${cycle.endDate}`}><Icon name="clock" size={14} />{cycle.name} · {shortDate(cycle.startDate)} – {shortDate(cycle.endDate)}</span>}
          <Link href="/notifications" className="iconbtn" title="Notifiche" aria-label={`Notifiche: ${unread} non lette`}><Icon name="bell" size={18} />{unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}</Link>
          <a href={MANUAL_URL || '/inizia'} target={MANUAL_URL ? '_blank' : undefined} rel={MANUAL_URL ? 'noreferrer' : undefined} className="iconbtn" title={MANUAL_URL ? 'Manuale' : 'Guida'} aria-label="Aiuto"><Icon name="help" size={18} /></a>
          <CommandPalette permissions={me.permissions} canSearchPeople={me.permissions.includes('people:read')} ctx={ctx} />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
