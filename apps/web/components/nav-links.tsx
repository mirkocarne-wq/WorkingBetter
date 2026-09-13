'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/dashboard', label: 'Home' },
  { href: '/objectives', label: 'Obiettivi' },
  { href: '/one-on-ones', label: '1:1', perm: 'one_on_ones:participate' },
  { href: '/feedback', label: 'Feedback', perm: 'feedback:give' },
  { href: '/forms', label: 'Form', perm: 'forms:respond' },
  { href: '/people', label: 'Persone', perm: 'people:read' },
  { href: '/notifications', label: 'Notifiche', perm: 'notifications:read' },
];

export function NavLinks({ permissions }: { permissions: string[] }) {
  const path = usePathname();
  return (
    <nav className="nav">
      {items
        .filter((i) => !i.perm || permissions.includes(i.perm))
        .map((i) => (
          <Link key={i.href} href={i.href} className={path.startsWith(i.href) ? 'on' : ''}>{i.label}</Link>
        ))}
      <div className="sec">In arrivo</div>
      <a style={{ opacity: 0.5 }}>Review</a>
      <a style={{ opacity: 0.5 }}>Survey</a>
      <a style={{ opacity: 0.5 }}>Welfare</a>
    </nav>
  );
}
