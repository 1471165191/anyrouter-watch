'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SITE } from '@/lib/config';

const LINKS = [
  { href: '/', label: '状态总览' },
  { href: '/status', label: '详细看板' },
  { href: '/report', label: '用户上报' },
  { href: '/discuss', label: '讨论区' },
  { href: '/check', label: '配置自检' },
  { href: '/errors', label: '错误码' },
  { href: '/clients', label: '客户端配置' },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">
          <span className="brand-dot" />
          {SITE.title}
        </Link>
        <div className="nav-links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href)) ? 'on' : undefined}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
