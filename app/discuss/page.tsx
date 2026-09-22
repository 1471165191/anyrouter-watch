import type { Metadata } from 'next';
import Link from 'next/link';
import DataSourceNotice from '@/components/DataSourceNotice';
import ThreadForm from '@/components/ThreadForm';
import { fmtAgo, fmtDateTime } from '@/components/viz';
import { ROUTES } from '@/lib/config';
import { loadThreads } from '@/lib/discuss';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '讨论区',
  description:
    'AnyRouter 没有官方社区，遇到问题只能自己猜。这里给用户一个互相确认的地方：今天挂了吗、你那条线路怎么样、这个报错是不是只有我。',
};

export default async function DiscussPage({
  searchParams,
}: {
  searchParams: Promise<{ route?: string }>;
}) {
  const { route } = await searchParams;
  const { threads, source } = await loadThreads(40, route || null);

  const totalReplies = threads.reduce((a, t) => a + t.replyCount, 0);

  return (
    <div>
      <DataSourceNotice source={source} />

      <h1>讨论区</h1>
      <p className="sub">
        官方既没有状态页也没有社区。在这里问一句、答一句，后面来的人就能少猜一次。
      </p>

      <div className="grid-2">
        <div className="card">
          <h3>遇到问题了？发帖问问</h3>
          <p className="faint" style={{ fontSize: 12, marginTop: -2, marginBottom: 14 }}>
            报错原文直接贴进来，比任何描述都有用。
          </p>
          <ThreadForm />
        </div>
        <div className="card">
          <h3>这里能帮上什么</h3>
          <ul className="acc-ul" style={{ marginTop: 0 }}>
            <li>确认「是不是只有我这样」—— 一个人挂是配置，一群人挂是站点</li>
            <li>把踩过的坑留下来，省下别人的半小时</li>
          </ul>
          <div className="banner-metrics" style={{ marginTop: 14 }}>
            <div className="metric">
              <div className="metric-val">{threads.length}</div>
              <div className="metric-label">帖子</div>
            </div>
            <div className="metric">
              <div className="metric-val">{totalReplies}</div>
              <div className="metric-label">回复</div>
            </div>
          </div>
          <div className="faint" style={{ fontSize: 12, marginTop: 14 }}>
            不用注册。发帖 1 分钟一条、回复 20 秒一条，只为挡刷屏。
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>{route ? `只看「${ROUTES.find((r) => r.id === route)?.name ?? route}」` : '全部帖子'}</h2>
          <span className="hint">按最后活跃时间排序</span>
        </div>

        {/* 只有一条线路的时候，「按线路筛选」这个控件本身就没意义了，直接不显示 */}
        {ROUTES.length > 1 ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <Link href="/discuss" className={`tag ${!route ? 'tag-on' : ''}`}>
              全部
            </Link>
            {ROUTES.map((r) => (
              <Link
                key={r.id}
                href={`/discuss?route=${r.id}`}
                className={`tag ${route === r.id ? 'tag-on' : ''}`}
              >
                {r.name}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="card" style={{ padding: '4px 20px' }}>
          {threads.length === 0 ? (
            <div className="faint" style={{ padding: '20px 0' }}>
              这条线路下还没有帖子。有问题的话，你正好可以当第一个。
            </div>
          ) : (
            threads.map((t) => (
              <div key={t.id} className="thread-item">
                <Link href={`/discuss/${t.id}`} className="thread-title">
                  {t.title}
                </Link>
                <div className="report-meta">
                  <span>{t.nick ?? '匿名'}</span>
                  <span>·</span>
                  <span>{fmtAgo(t.updatedAt)}</span>
                  <span>·</span>
                  <span>{t.replyCount} 条回复</span>
                  {t.routeName ? <span className="tag">{t.routeName}</span> : null}
                  {t.groupName ? <span className="tag">{t.groupName}</span> : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="section">
        <div className="alert">
          <b>这里不适合放什么</b>
          <div className="dim" style={{ marginTop: 4 }}>
            别贴 API key、账号、订单号。别发广告和拼车拉群。这个站是非官方的，
            这里说的话不代表 {ROUTES.length > 0 ? 'AnyRouter' : ''} 官方，官方也看不到。
            最后更新：{threads[0] ? fmtDateTime(threads[0].updatedAt) : '暂无'}
          </div>
        </div>
      </div>
    </div>
  );
}
