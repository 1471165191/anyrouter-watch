import Link from 'next/link';
import DataSourceNotice from '@/components/DataSourceNotice';
import ReportFeed from '@/components/ReportFeed';
import ReportForm from '@/components/ReportForm';
import { StatusBadge, UptimeBars, fmtAgo, fmtDateTime, fmtPct } from '@/components/viz';
import { SITE, GROUPS } from '@/lib/config';
import { getSiteStats } from '@/lib/stats';
import { loadReports, summarize } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * 首页 = 4 个板块，不再多。
 *
 * 2026-09-22 精简前是 7 个（状态横幅 / 线路卡片 / 热力图 / 反馈表单+流水 /
 * 讨论列表 / 故障表 / 工具卡），从上滚到底要滑很久，重点全被稀释了。
 * 现在的取舍：
 *   · 热力图和故障表 → 移进 /status（它们属于「想深挖时才看」的东西）
 *   · 用户反馈 + 讨论 → 合成一个板块，本来就是同一件事的两面
 *   · 工具入口 → 从三张大卡压成一行链接
 * 首页只回答一个问题：现在能不能用。
 */

const BANNER_TITLE = {
  ok: '线路正常',
  degraded: '线路有波动',
  down: '线路不可用',
} as const;

export default async function HomePage() {
  const { routes, level, uptime24h, recommended, source, dbOk, lastProbeAt, sampleRows } =
    await getSiteStats();
  const { reports } = await loadReports(8);
  const summary = summarize(reports);

  // 样本太少时别把百分比当结论看。
  // 站点刚上线时库里可能只有一两轮数据，全失败就是「0.0%」，看着像站点挂了，
  // 其实只是没攒够样本。这里明确说一句。
  const thinSample = source === 'db' && sampleRows < routes.length * GROUPS.length * 12;

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
            {SITE.name} · 每 5 分钟独立探测
            {lastProbeAt ? ` · 更新于 ${fmtAgo(lastProbeAt)}` : ''}
            {thinSample ? ` · 样本还在积累（当前 ${sampleRows} 条），百分比仅供参考` : ''}
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
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>线路状态</h2>
          <span className="hint">
            上次探测 {lastProbeAt ? fmtDateTime(lastProbeAt) : '—'} · 明细见{' '}
            <Link href="/status">详细看板</Link>
          </span>
        </div>
        <div className="grid-2">
          {routes.map((r) => (
            <div key={r.route.id} className="route-card">
              <div className="route-top">
                <span className="route-name">{r.route.name}</span>
                <StatusBadge level={r.current} />
                <span className="badge neutral" style={{ marginLeft: 'auto' }}>
                  {r.route.needsProxy ? '需代理' : '免代理'}
                </span>
              </div>
              <div className="route-url">{r.route.baseUrl}</div>
              {r.likelyDead ? (
                <div className="alert dead" style={{ fontSize: 12.5, padding: '8px 10px' }}>
                  这条地址连续探测全部失败，多半已经换过了 —— 去
                  <Link href="/discuss">讨论区</Link>看看别人现在用的是哪个。
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
          <h2>你那边怎么样</h2>
          <span className="hint">
            近 1 小时 {summary.total} 条上报
            {summary.total ? ` · 正常 ${summary.ok} · 慢 ${summary.slow} · 用不了 ${summary.down}` : ''}
          </span>
        </div>
        <div className="grid-2">
          <div className="card">
            <h3>花 10 秒报一条</h3>
            <p className="faint" style={{ fontSize: 12, marginTop: -2, marginBottom: 14 }}>
              官方没有状态页，你的这一票就是别人的参考。
            </p>
            <ReportForm />
          </div>
          <div className="card">
            <h3>最新上报</h3>
            <ReportFeed reports={reports} />
            <div style={{ paddingTop: 12, display: 'flex', gap: 8 }}>
              <Link href="/discuss" className="btn ghost sm">
                进讨论区
              </Link>
              <Link href="/report" className="btn ghost sm">
                全部上报
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="card quick-links">
          <Link href="/discuss">
            <b>讨论区</b>
            <span>问问别人是不是也这样 —— 一个人挂是配置，一群人挂是站点</span>
          </Link>
          <Link href="/check">
            <b>配置自检</b>
            <span>填地址和 key，三步分清是网络、鉴权还是上游的问题</span>
          </Link>
          <Link href="/guide">
            <b>排障手册</b>
            <span>报错对照表 + 各客户端 base_url 到底要不要带 /v1</span>
          </Link>
          <Link href="/status">
            <b>详细看板</b>
            <span>逐分组的可用率、延迟曲线、时段热力图和故障时间线</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
