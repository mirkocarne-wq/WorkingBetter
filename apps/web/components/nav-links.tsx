'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items: { href: string; label: string; perm?: string; anyPerm?: string[] }[] = [
  { href: '/dashboard', label: 'Home' },
  { href: '/objectives', label: 'Obiettivi' },
  { href: '/one-on-ones', label: '1:1', perm: 'one_on_ones:participate' },
  { href: '/feedback', label: 'Feedback', perm: 'feedback:give' },
  { href: '/reviews', label: 'Review', perm: 'reviews:participate' },
  { href: '/surveys', label: 'Survey', anyPerm: ['surveys:respond', 'surveys:manage'] },
  { href: '/welfare', label: 'Welfare', anyPerm: ['welfare:use', 'welfare:manage'] },
  { href: '/forms', label: 'Form', perm: 'forms:respond' },
  { href: '/analytics', label: 'Report', anyPerm: ['analytics:query', 'analytics:query:team'] },
  { href: '/people', label: 'Persone', perm: 'people:read' },
  { href: '/notifications', label: 'Notifiche', perm: 'notifications:read' },
  { href: '/settings', label: 'Impostazioni' },
];

export function NavLinks({ permissions }: { permissions: string[] }) {
  const path = usePathname();
  return (
    <nav className="nav">
      {items
        .filter((i) => (!i.perm || permissions.includes(i.perm)) && (!i.anyPerm || i.anyPerm.some((p) => permissions.includes(p))))
        .map((i) => (
          <Link key={i.href} href={i.href} className={path.startsWith(i.href) ? 'on' : ''} aria-current={path.startsWith(i.href) ? 'page' : undefined}>{i.label}</Link>
        ))}
    </nav>
  );
}
