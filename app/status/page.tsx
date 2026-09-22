import type { Metadata } from 'next';
import DataSourceNotice from '@/components/DataSourceNotice';
import { LatencyChart, StatusBadge, UptimeBars, fmtAgo, fmtPct } from '@/components/viz';
import { GROUPS } from '@/lib/config';
import { getSiteStats } from '@/lib/stats';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '详细看板',
  description: '按线路和分组拆开的可用率、延迟趋势与错误码分布。',
};

export default async function StatusPage() {
  const { routes, level, source } = await getSiteStats();

  return (
    <div>
      <DataSourceNotice source={source} />

      <h1>详细看板</h1>
      <p className="sub">
        每个「线路 × 分组」组合每 5 分钟探测一次，共 {routes.length * GROUPS.length} 个探测目标。
        {level === 'ok' ? '当前整体正常。' : '当前存在异常，见下方标红项。'}
      </p>

      <div className="section" style={{ marginTop: 0 }}>
        <div className="section-head">
          <h2>分组 × 线路 矩阵</h2>
          <span className="hint">数字为 24 小时可用率</span>
        </div>
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>分组</th>
                {routes.map((r) => (
                  <th key={r.route.id}>
                    {r.route.name}
                    <div className="faint" style={{ fontWeight: 400 }}>
                      {r.route.needsProxy ? '需代理' : '免代理'}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => (
                <tr key={g.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{g.name}</div>
                    <div className="faint" style={{ fontSize: 11.5 }}>
                      {g.desc}
                    </div>
                  </td>
                  {routes.map((r) => {
                    const t = r.targets.find((x) => x.groupId === g.id);
                    if (!t || !t.hasData) {
                      return (
                        <td key={r.route.id} className="num faint">
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={r.route.id} className="num">
                        <span className={`dot lv-${t.current}`} style={{ marginRight: 7 }} />
                        <b>{fmtPct(t.uptime24h, 1)}</b>
                        <div className="faint" style={{ fontSize: 11.5 }}>
                          {t.avgLatency}ms
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>各线路趋势</h2>
          <span className="hint">延迟越低越好，红色竖线是探测失败</span>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          {routes.map((r) => (
            <div key={r.route.id} className="card">
              <div className="route-top" style={{ marginBottom: 10 }}>
                <span className="route-name">{r.route.name}</span>
                <StatusBadge level={r.current} />
                <span className="badge neutral">{r.route.needsProxy ? '需代理' : '免代理'}</span>
                <span className="faint" style={{ marginLeft: 'auto', fontSize: 12 }}>
                  {r.route.note}
                </span>
              </div>
              <div className="route-url" style={{ marginBottom: 10 }}>
                {r.route.baseUrl}
              </div>
              <UptimeBars probes={r.probes} />
              <div className="chart-wrap" style={{ marginTop: 14 }}>
                <LatencyChart probes={r.probes} />
              </div>
              <div className="route-stats" style={{ marginTop: 10 }}>
                <span>
                  24h 可用率 <b>{fmtPct(r.uptime24h, 2)}</b>
                </span>
                <span>
                  平均延迟 <b>{r.avgLatency}ms</b>
                </span>
                <span>
                  P95 <b>{r.p95Latency}ms</b>
                </span>
                <span>
                  最后探测 <b>{r.lastProbeAt ? fmtAgo(r.lastProbeAt) : '—'}</b>
                </span>
              </div>
              {r.errorBreakdown.length > 0 ? (
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {r.errorBreakdown.map((e) => (
                    <span key={e.code} className="tag">
                      {e.label} × {e.count}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="faint" style={{ marginTop: 12, fontSize: 12 }}>
                  24 小时内没有探测失败
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
