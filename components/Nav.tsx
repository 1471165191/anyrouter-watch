'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SITE } from '@/lib/config';

/**
 * 导航只留 5 项。
 *
 * 之前是 7 项（状态总览 / 详细看板 / 用户上报 / 讨论区 / 配置自检 / 错误码 / 客户端配置），
 * 一眼扫过去分不清主次。收敛原则：
 *   · 「用户上报」并进「讨论区」—— 它本来就是同一件事的两种形态，页面保留、入口收进首页和讨论区
 *   · 「错误码」+「客户端配置」合并成「排障手册」—— 都是查手册的场景，不该占两个导航位
 */
const LINKS = [
  { href: '/', label: '状态总览' },
  { href: '/status', label: '详细看板' },
  { href: '/discuss', label: '讨论区' },
  { href: '/check', label: '配置自检' },
  { href: '/guide', label: '排障手册' },
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
