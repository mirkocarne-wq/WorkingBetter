import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError, apiFetch, initials, type Me, type Tenant } from '@/lib/api';
import { logout } from '@/lib/actions';
import { NavLinks } from '@/components/nav-links';
import { AppShell } from '@/components/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let me: Me;
  let unread = 0;
  let tenant: Tenant | null = null;
  try {
    me = await apiFetch<Me>('/me');
    [unread, tenant] = await Promise.all([
      apiFetch<{ count: number }>('/notifications/unread-count').then((r) => r.count).catch(() => 0),
      apiFetch<Tenant>('/tenant').catch(() => null),
    ]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect('/login');
    throw e;
  }
  const name = me.person ? `${me.person.firstName} ${me.person.lastName}` : (me.user.email ?? 'Utente');
  const brand = tenant?.settings?.branding?.primaryColor ?? null;
  return (
    <AppShell
      brandColor={brand}
      sidebar={
        <>
          <Link href="/dashboard" className="logo"><i />WorkingBetter</Link>
          <NavLinks permissions={me.permissions} />
          <div className="me">
            <span className="av">{me.person ? initials(me.person) : '?'}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{me.person?.jobTitle ?? me.user.roles.join(', ')}</div>
            </div>
          </div>
        </>
      }
      topbar={
        <>
          {tenant && <span className="tenant">{tenant.name}</span>}
          <span className="sp" />
          <Link href="/notifications" className={`pill ${unread ? 'b' : 'n'}`} title="Notifiche" aria-label={`Notifiche: ${unread} non lette`}>🔔 {unread}</Link>
          <span className="pill n">{me.user.roles.join(' · ')}</span>
          <form action={logout}><button className="btn sm">Esci</button></form>
        </>
      }
    >
      {children}
    </AppShell>
  );
}
