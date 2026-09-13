'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/dashboard', label: 'Home' },
  { href: '/objectives', label: 'Obiettivi' },
  { href: '/people', label: 'Persone', perm: 'people:read' },
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
      <a style={{ opacity: 0.5 }}>1:1</a>
      <a style={{ opacity: 0.5 }}>Feedback</a>
      <a style={{ opacity: 0.5 }}>Review</a>
      <a style={{ opacity: 0.5 }}>Welfare</a>
    </nav>
  );
}
