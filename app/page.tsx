import Link from 'next/link';
import DataSourceNotice from '@/components/DataSourceNotice';
import ReportFeed from '@/components/ReportFeed';
import ReportForm from '@/components/ReportForm';
import { Heatmap, StatusBadge, UptimeBars, fmtAgo, fmtDateTime, fmtDuration, fmtPct } from '@/components/viz';
import { SITE } from '@/lib/config';
import { loadRecentThreads } from '@/lib/discuss';
import { getSiteStats } from '@/lib/stats';
import { loadReports, summarize } from '@/lib/store';

export const dynamic = 'force-dynamic';

const BANNER_TITLE = {
  ok: '全部线路正常',
  degraded: '部分线路波动',
  down: '线路大面积不可用',
} as const;

export default async function HomePage() {
  const { routes, heatmap, level, uptime24h, incidents, recommended, source, dbOk, lastProbeAt } =
    await getSiteStats();
  const { reports } = await loadReports(14);
  const summary = summarize(reports);
  const { threads: recentThreads } = await loadRecentThreads(4);

  return (
    <div>
      <DataSourceNotice source={source} dbOk={dbOk} />

      <div className="banner">
        <div className="banner-main">
          <p className="banner-title">
            <span className={`dot lv-${level}`} />
            {BANNER_TITLE[level]}
          </p>
          <p className="banner-note">
            {SITE.name} · 每 5 分钟独立探测一次
            {lastProbeAt ? ` · 最后更新 ${fmtAgo(lastProbeAt)}（${fmtDateTime(lastProbeAt)}）` : ''}
          </p>
        </div>
        <div className="banner-metrics">
          <div className="metric">
            <div className="metric-val">{fmtPct(uptime24h, 1)}</div>
            <div className="metric-label">24h 可用率</div>
          </div>
          <div className="metric">
            <div className="metric-val">{recommended.avgLatency}ms</div>
            <div className="metric-label">平均延迟</div>
          </div>
          <div className="metric">
            <div className={`metric-val lv-${summary.okRate >= 0.8 ? 'ok' : summary.okRate >= 0.5 ? 'degraded' : 'down'}`}>
              {summary.total ? fmtPct(summary.okRate, 0) : '—'}
            </div>
            <div className="metric-label">用户反馈正常率</div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>现在该用哪条线路</h2>
          <span className="hint">
            推荐 <b style={{ color: 'var(--ok)' }}>{recommended.route.name}</b>
            {recommended.route.needsProxy ? '（需要科学上网）' : '（国内可直连）'}
          </span>
        </div>
        <div className="grid-2">
          {routes.map((r) => (
            <div key={r.route.id} className={`route-card ${r.route.id === recommended.route.id ? 'rec' : ''}`}>
              <div className="route-top">
                <span className="route-name">{r.route.name}</span>
                <StatusBadge level={r.current} />
                {r.route.id === recommended.route.id ? <span className="badge lv-ok">推荐</span> : null}
                <span className="badge neutral" style={{ marginLeft: 'auto' }}>
                  {r.route.needsProxy ? '需代理' : '免代理'}
                </span>
              </div>
              <div className="route-url">{r.route.baseUrl}</div>
              {r.likelyDead ? (
                <div className="alert dead" style={{ fontSize: 12.5, padding: '8px 10px' }}>
                  这条地址连续探测全部失败，多半已经换过了 —— 别在这儿等，
                  去<a href="/discuss">讨论区</a>看看别人现在用的是哪个。
                </div>
              ) : null}
              <UptimeBars probes={r.probes} />
              <div className="route-stats">
                <span>
                  24h <b>{fmtPct(r.uptime24h, 2)}</b>
                </span>
                <span>
                  近 1 小时 <b>{fmtPct(r.uptime1h, 0)}</b>
                </span>
                <span>
                  延迟 <b>{r.avgLatency}ms</b>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>什么时段最稳</h2>
          <span className="hint">过去 24 小时逐小时可用率 · 颜色越绿越稳</span>
        </div>
        <div className="card">
          <Heatmap buckets={heatmap} />
          <div className="faint" style={{ fontSize: 12, marginTop: 12 }}>
            社区普遍反馈凌晨最流畅、下午到深夜最挤，这张图能帮你挑时间。绿色 ≥98% · 黄色 ≥88% · 红色 &lt;75%
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>用户实时反馈</h2>
          <span className="hint">
            近 1 小时 {summary.total} 条 · 正常 {summary.ok} · 慢 {summary.slow} · 用不了 {summary.down}
          </span>
        </div>
        <div className="grid-2">
          <div className="card">
            <h3>你那边现在怎么样？</h3>
            <p className="faint" style={{ fontSize: 12, marginTop: -2, marginBottom: 14 }}>
              官方没有状态页，你的这一票就是别人的参考。
            </p>
            <ReportForm />
          </div>
          <div className="card">
            <h3>最新上报</h3>
            <ReportFeed reports={reports} />
            <Link href="/report" className="btn ghost sm" style={{ marginTop: 12 }}>
              查看全部上报
            </Link>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>大家在聊什么</h2>
          <span className="hint">官方没有社区，这里是用户自己凑出来的</span>
        </div>
        <div className="card" style={{ padding: '4px 20px 16px' }}>
          {recentThreads.length === 0 ? (
            <div className="faint" style={{ padding: '20px 0' }}>
              还没有帖子。遇到问题的话，你正好可以当第一个。
            </div>
          ) : (
            recentThreads.map((t) => (
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
                </div>
              </div>
            ))
          )}
          <div style={{ paddingTop: 14 }}>
            <Link href="/discuss" className="btn ghost sm">
              进讨论区
            </Link>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>最近故障</h2>
          <span className="hint">连续 15 分钟以上探测失败才会计入</span>
        </div>
        <div className="card">
          {incidents.length === 0 ? (
            <div className="faint">过去 24 小时没有持续故障，运气不错。</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>开始时间</th>
                  <th>线路</th>
                  <th>分组</th>
                  <th>持续</th>
                  <th>表现</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((i) => (
                  <tr key={i.id}>
                    <td className="num">{fmtDateTime(i.startedAt)}</td>
                    <td>{i.routeName}</td>
                    <td>{i.groupName}</td>
                    <td className="num">{fmtDuration(i.durationMs)}</td>
                    <td>
                      <span className="badge lv-down">
                        <span className="dot lv-down" />
                        {i.peakStatus} · {i.summary}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>配置不对？先别怀疑自己</h2>
        </div>
        <div className="grid-3">
          <Link href="/check" className="card" style={{ color: 'inherit' }}>
            <h3>配置自检 →</h3>
            <div className="dim" style={{ fontSize: 12.5 }}>
              填上地址和 key，三步验证到底是网络、鉴权还是上游的问题。key 不落库、不记日志。
            </div>
          </Link>
          <Link href="/errors" className="card" style={{ color: 'inherit' }}>
            <h3>错误码百科 →</h3>
            <div className="dim" style={{ fontSize: 12.5 }}>
              502 / 503 / 429 / 超时，以及「上游负载压力太大」这类报错原文，逐条给原因和解法。
            </div>
          </Link>
          <Link href="/clients" className="card" style={{ color: 'inherit' }}>
            <h3>客户端配置 →</h3>
            <div className="dim" style={{ fontSize: 12.5 }}>
              Cherry Studio、Cline、Cursor 等客户端的填法，重点是 base_url 到底要不要带 /v1。
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
