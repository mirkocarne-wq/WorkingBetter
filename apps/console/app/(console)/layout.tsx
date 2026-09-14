import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError, apiFetch, type Operator } from '@/lib/api';
import { logout } from '@/lib/actions';
import { Nav } from '@/components/nav';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  let me: Operator;
  try {
    me = await apiFetch<Operator>('/platform/auth/me');
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) redirect('/login');
    throw e;
  }
  return (
    <div className="app" style={{ ['--brand' as string]: '#1f5fbf' }}>
      <aside className="side">
        <Link href="/" className="logo"><i />WorkingBetter</Link>
        <div className="sup" style={{ margin: '-6px 0 10px 4px' }}>Console di piattaforma</div>
        <Nav />
        <div className="me">
          <span className="av">{(me.firstName[0] ?? '') + (me.lastName[0] ?? '')}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.firstName} {me.lastName}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.email}</div>
          </div>
        </div>
      </aside>
      <header className="top">
        <span className="tenant">Piattaforma · porta 8443</span>
        <span className="sp" />
        <span className="pill n">platform_admin</span>
        <form action={logout}><button className="btn sm">Esci</button></form>
      </header>
      <main id="main">
        {me.mustChangePassword && <div className="suggest" style={{ marginBottom: 16 }}>La tua password è quella iniziale: <Link href="/account?first=1" style={{ color: 'var(--brand-2)' }}>cambiala ora</Link> prima di operare sui tenant.</div>}
        {children}
      </main>
    </div>
  );
}
