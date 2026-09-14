'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/', label: 'Stato' },
  { href: '/tenants', label: 'Tenant' },
  { href: '/users', label: 'Utenti' },
  { href: '/logs', label: 'Log' },
  { href: '/operators', label: 'Operatori' },
  { href: '/account', label: 'Il mio account' },
];

export function Nav() {
  const path = usePathname();
  const on = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <nav className="nav">
      {items.map((i) => <Link key={i.href} href={i.href} className={on(i.href) ? 'on' : ''} aria-current={on(i.href) ? 'page' : undefined}>{i.label}</Link>)}
    </nav>
  );
}
