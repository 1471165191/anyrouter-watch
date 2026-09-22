import type { Metadata } from 'next';
import DataSourceNotice from '@/components/DataSourceNotice';
import ReportFeed from '@/components/ReportFeed';
import ReportForm from '@/components/ReportForm';
import { fmtPct } from '@/components/viz';
import { VERDICT_LABEL } from '@/lib/config';
import { loadReports, summarize } from '@/lib/store';
import type { UserReport } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '用户上报',
  description: '把你的实际情况报上来 —— 官方没有状态页，用户反馈就是唯一真相。',
};

function countBy(reports: UserReport[], key: 'routeName' | 'client' | 'network') {
  const map = new Map<string, { total: number; ok: number }>();
  reports.forEach((r) => {
    const k = r[key];
    if (!k) return;
    const cur = map.get(k) ?? { total: 0, ok: 0 };
    cur.total += 1;
    if (r.verdict === 'ok') cur.ok += 1;
    map.set(k, cur);
  });
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v, rate: v.ok / v.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
}

export default async function ReportPage() {
  const { reports, source } = await loadReports(60);
  const summary = summarize(reports, 6 * 60 * 60 * 1000);
  const byRoute = countBy(reports, 'routeName');
  const byClient = countBy(reports, 'client');

  return (
    <div>
      <DataSourceNotice source={source} />

      <h1>用户上报</h1>
      <p className="sub">
        官方不给状态页，那我们就自己攒一个。你花 10 秒报一条，后面来的人就能少走一段弯路。
      </p>

      <div className="grid-2">
        <div className="card">
          <h3>报一下你现在的情况</h3>
          <ReportForm />
        </div>
        <div className="card">
          <h3>近 6 小时汇总</h3>
          <div className="banner-metrics" style={{ marginTop: 6 }}>
            <div className="metric">
              <div className="metric-val">{summary.total}</div>
              <div className="metric-label">上报条数</div>
            </div>
            <div className="metric">
              <div className={`metric-val lv-ok`}>{summary.ok}</div>
              <div className="metric-label">{VERDICT_LABEL.ok}</div>
            </div>
            <div className="metric">
              <div className="metric-val lv-degraded">{summary.slow}</div>
              <div className="metric-label">{VERDICT_LABEL.slow}</div>
            </div>
            <div className="metric">
              <div className="metric-val lv-down">{summary.down}</div>
              <div className="metric-label">{VERDICT_LABEL.down}</div>
            </div>
          </div>

          {byRoute.length > 0 ? (
            <div style={{ marginTop: 20 }}>
              <h3>按线路看反馈</h3>
              <table className="table">
                <tbody>
                  {byRoute.map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td className="num faint">{r.total} 条</td>
                      <td className="num">
                        <b className={r.rate >= 0.8 ? 'lv-ok' : r.rate >= 0.5 ? 'lv-degraded' : 'lv-down'}>
                          {fmtPct(r.rate, 0)}
                        </b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {byClient.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <h3>按客户端看反馈</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {byClient.map((c) => (
                  <span key={c.name} className="tag">
                    {c.name} · {c.total} 条 · {fmtPct(c.rate, 0)} 正常
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>全部上报</h2>
          <span className="hint">按时间倒序 · 共 {reports.length} 条</span>
        </div>
        <div className="card">
          <ReportFeed reports={reports} />
        </div>
      </div>

      <div className="section">
        <div className="alert">
          <b>关于隐私</b>
          <div className="dim" style={{ marginTop: 4 }}>
            上报只保存你选的状态、线路、客户端、网络类型和自愿填写的说明文字。不要求登录，不采集账号，
            不采集 API key，不做用户画像。补充说明里请不要贴 key。
          </div>
        </div>
      </div>
    </div>
  );
}
