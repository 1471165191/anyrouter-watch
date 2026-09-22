import { VERDICT_LABEL } from '@/lib/config';
import type { UserReport, Verdict } from '@/lib/types';
import { fmtAgo } from './viz';

const V_LEVEL: Record<Verdict, string> = { ok: 'ok', slow: 'degraded', down: 'down' };

export default function ReportFeed({ reports }: { reports: UserReport[] }) {
  if (reports.length === 0) {
    return <div className="faint">还没有人上报，你可以是第一个。</div>;
  }
  return (
    <div>
      {reports.map((r) => (
        <div key={r.id} className="report-item">
          <span className={`badge lv-${V_LEVEL[r.verdict]}`} style={{ height: 'fit-content' }}>
            <span className={`dot lv-${V_LEVEL[r.verdict]}`} />
            {VERDICT_LABEL[r.verdict]}
          </span>
          <div className="report-body">
            {r.message ? <div className="report-msg">{r.message}</div> : null}
            <div className="report-meta">
              <span>{fmtAgo(r.ts)}</span>
              {r.routeName ? <span className="tag">{r.routeName}</span> : null}
              {r.groupName ? <span className="tag">{r.groupName}</span> : null}
              {r.client ? <span className="tag">{r.client}</span> : null}
              {r.network ? <span className="tag">{r.network}</span> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
