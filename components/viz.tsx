import type { HealthLevel, HourBucket, Probe } from '@/lib/types';

export const LEVEL_LABEL: Record<HealthLevel, string> = {
  ok: '正常',
  degraded: '波动',
  down: '故障',
};

export function StatusBadge({ level, text }: { level: HealthLevel; text?: string }) {
  return (
    <span className={`badge lv-${level}`}>
      <span className={`dot lv-${level}`} />
      {text ?? LEVEL_LABEL[level]}
    </span>
  );
}

function bucketLevel(items: Probe[]): HealthLevel {
  const ok = items.filter((p) => p.ok).length;
  if (ok === items.length) return 'ok';
  if (ok === 0) return 'down';
  return 'degraded';
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 状态页经典的可用率条：把窗口切成若干格，每格代表一小段时间 */
export function UptimeBars({ probes, buckets = 48 }: { probes: Probe[]; buckets?: number }) {
  const size = Math.max(1, Math.ceil(probes.length / buckets));
  const groups: Probe[][] = [];
  for (let i = 0; i < probes.length; i += size) groups.push(probes.slice(i, i + size));

  const start = probes[0]?.ts ?? Date.now();
  const end = probes[probes.length - 1]?.ts ?? Date.now();

  return (
    <div>
      <div className="bars">
        {groups.map((g, i) => {
          const lv = bucketLevel(g);
          return (
            <div
              key={i}
              className={`bar ${lv}`}
              title={`${fmtTime(g[0].ts)} – ${fmtTime(g[g.length - 1].ts)}  ${LEVEL_LABEL[lv]}`}
            />
          );
        })}
      </div>
      <div className="bars-legend">
        <span>{fmtTime(start)}</span>
        <span>24 小时前 → 现在</span>
        <span>{fmtTime(end)}</span>
      </div>
    </div>
  );
}

/** 延迟曲线：正常点连线，失败点在底部标红 */
export function LatencyChart({ probes, height = 150 }: { probes: Probe[]; height?: number }) {
  const W = 1000;
  const H = height;
  const padT = 12;
  const padB = 22;
  const okPoints = probes.filter((p) => p.ok);
  const max = Math.max(1200, ...okPoints.map((p) => p.latencyMs));
  const step = W / Math.max(1, probes.length - 1);

  const yOf = (ms: number) => padT + (1 - ms / max) * (H - padT - padB);

  let path = '';
  let started = false;
  probes.forEach((p, i) => {
    if (!p.ok) {
      started = false;
      return;
    }
    const x = i * step;
    const y = yOf(p.latencyMs);
    path += `${started ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
    started = true;
  });

  const failed = probes.map((p, i) => ({ p, i })).filter((x) => !x.p.ok);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img">
      <title>延迟趋势</title>
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={0}
          x2={W}
          y1={padT + f * (H - padT - padB)}
          y2={padT + f * (H - padT - padB)}
          stroke="#22303e"
          strokeWidth="1"
          strokeDasharray="4 6"
        />
      ))}
      <path d={path} fill="none" stroke="#58a6ff" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
      {failed.map(({ p, i }) => (
        <line
          key={p.ts}
          x1={i * step}
          x2={i * step}
          y1={padT}
          y2={H - padB}
          stroke="#f85149"
          strokeWidth="2"
          opacity="0.55"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <text x={4} y={H - 6} fill="#5c6b7a" fontSize="11">
        峰值参考 {Math.round(max)}ms · 红色竖线为探测失败
      </text>
    </svg>
  );
}

function heatColor(uptime: number): string {
  if (uptime >= 0.98) return '#3fb950';
  if (uptime >= 0.94) return '#7bbf52';
  if (uptime >= 0.88) return '#d29922';
  if (uptime >= 0.75) return '#e0703a';
  return '#f85149';
}

/** 24 小时时段热力图 —— 一眼看出「几点最稳」 */
export function Heatmap({ buckets }: { buckets: HourBucket[] }) {
  const byHour = new Map(buckets.map((b) => [b.hour, b]));
  const cells = Array.from({ length: 24 }, (_, h) => byHour.get(h) ?? { hour: h, uptime: 1, samples: 0 });

  return (
    <div>
      <div className="heat">
        {cells.map((c) => (
          <div
            key={c.hour}
            className="heat-cell"
            style={{ background: heatColor(c.uptime) }}
            title={`${String(c.hour).padStart(2, '0')}:00 前后可用率 ${(c.uptime * 100).toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="heat-hours">
        {cells.map((c) => (
          <span key={c.hour}>{String(c.hour).padStart(2, '0')}</span>
        ))}
      </div>
    </div>
  );
}

export function fmtPct(v: number, digits = 2): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

export function fmtAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

export function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
