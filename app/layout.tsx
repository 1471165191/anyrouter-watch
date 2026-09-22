import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import { SITE } from '@/lib/config';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: `${SITE.title} · ${SITE.tagline}`,
    template: `%s · ${SITE.title}`,
  },
  description:
    'AnyRouter 中转站的第三方可用性观测站：实时线路状态、故障时间线、配置自检工具和用户众包上报。官方没有状态页，这里就是。',
  keywords: ['AnyRouter', '中转站', '状态页', '可用性', '502', '429', 'API 配置'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Nav />
        <main className="wrap page">{children}</main>
        <footer className="footer">
          <div className="wrap">
            <div>
              {SITE.title} · 非官方第三方观测站，与 {SITE.name} 官方无任何关联。
            </div>
            <div>
              所有状态数据来自独立探测与用户自发上报，仅供参考。配置问题请以官方说明为准。
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
