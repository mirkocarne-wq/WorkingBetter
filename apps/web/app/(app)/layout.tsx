import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError, apiFetch, initials, type Me } from '@/lib/api';
import { logout } from '@/lib/actions';
import { NavLinks } from '@/components/nav-links';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let me: Me;
  let unread = 0;
  try {
    me = await apiFetch<Me>('/me');
    unread = (await apiFetch<{ count: number }>('/notifications/unread-count').catch(() => ({ count: 0 }))).count;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect('/login');
    throw e;
  }
  const name = me.person ? `${me.person.firstName} ${me.person.lastName}` : (me.user.email ?? 'Utente');
  return (
    <div className="app">
      <aside className="side">
        <Link href="/dashboard" className="logo"><i />WorkingBetter</Link>
        <NavLinks permissions={me.permissions} />
        <div className="me">
          <span className="av">{me.person ? initials(me.person) : '?'}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{me.person?.jobTitle ?? me.user.roles.join(', ')}</div>
          </div>
        </div>
      </aside>
      <header className="top">
        <span className="sp" />
        <Link href="/notifications" className={`pill ${unread ? 'b' : 'n'}`} title="Notifiche">🔔 {unread}</Link>
        <span className="pill n">{me.user.roles.join(' · ')}</span>
        <form action={logout}><button className="btn sm">Esci</button></form>
      </header>
      <main>{children}</main>
    </div>
  );
}
