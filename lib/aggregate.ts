import { ERROR_LABELS, GROUPS, STEP_MS } from './config';
import type { GroupDef, HealthLevel, HourBucket, Incident, Probe, RouteDef, RouteStats, TargetStats } from './types';

/**
 * 纯聚合逻辑：给一批探测结果，算出各种统计量。
 * 不关心数据是从数据库来的还是生成的 —— 所以这里没有任何 IO。
 */

export type ProbeMap = Map<string, Probe[]>;

export function targetKey(routeId: string, groupId: string): string {
  return `${routeId}:${groupId}`;
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

function avg(values: number[]): number {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
}

function levelOf(probes: Probe[]): HealthLevel {
  if (probes.length === 0) return 'ok';
  const last = probes[probes.length - 1];
  const recent = probes.slice(-12);
  const okRate = recent.filter((p) => p.ok).length / recent.length;
  if (!last.ok) return 'down';
  if (okRate < 0.9) return 'degraded';
  return 'ok';
}

function extractIncidents(route: RouteDef, group: GroupDef, probes: Probe[]): Incident[] {
  if (probes.length === 0) return [];
  const incidents: Incident[] = [];
  let runStart: number | null = null;
  let peak = 0;

  const close = (endTs: number | null) => {
    if (runStart === null) return;
    const startedAt = runStart;
    incidents.push({
      id: `${route.id}-${group.id}-${startedAt}`,
      routeId: route.id,
      routeName: route.name,
      groupId: group.id,
      groupName: group.name,
      startedAt,
      endedAt: endTs,
      durationMs: (endTs ?? probes[probes.length - 1].ts) - startedAt + STEP_MS,
      peakStatus: peak,
      summary:
        peak === 503
          ? '上游负载压力过大，请求被拒'
          : peak === 502
            ? '上游网关返回 502'
            : peak === 429
              ? '触发限流'
              : '探测超时',
    });
    runStart = null;
    peak = 0;
  };

  probes.forEach((p) => {
    if (!p.ok) {
      if (runStart === null) runStart = p.ts;
      peak = Math.max(peak, p.status);
    } else {
      close(p.ts - STEP_MS);
    }
  });
  close(null);

  return incidents.filter((i) => i.durationMs >= STEP_MS * 3);
}

function buildTargetStats(route: RouteDef, group: GroupDef, probes: Probe[]): TargetStats {
  const okProbes = probes.filter((p) => p.ok);
  const recent = probes.slice(-12);
  return {
    routeId: route.id,
    groupId: group.id,
    hasData: probes.length > 0,
    probes,
    uptime24h: probes.length ? okProbes.length / probes.length : 0,
    uptime1h: recent.length ? recent.filter((p) => p.ok).length / recent.length : 0,
    avgLatency: avg(okProbes.map((p) => p.latencyMs)),
    p95Latency: p95(okProbes.map((p) => p.latencyMs)),
    current: levelOf(probes),
    lastProbeAt: probes.length ? probes[probes.length - 1].ts : 0,
  };
}

/**
 * 判定「地址已失效」，用来和「临时故障」区分开。
 *
 * 两者对用户的意义完全相反：临时故障等一等就好，地址失效得去换地址。
 * 只看单次失败会误判 —— 一次超时可能是抖一下。所以要求两个条件同时成立：
 *   1. 每个有数据的分组都攒够了样本（避免刚上线探了几次就下结论）
 *   2. 这段时间里所有分组一次都没成功过
 * 全失败但样本很少 → 还是当故障；有任何一个分组成功 → 说明地址是活的。
 */
const DEAD_MIN_SAMPLES_PER_TARGET = 24; // 5 分钟一次 ≈ 2 小时

function isLikelyDead(targets: TargetStats[]): boolean {
  const withData = targets.filter((t) => t.hasData);
  if (withData.length === 0) return false;
  if (withData.some((t) => t.probes.length < DEAD_MIN_SAMPLES_PER_TARGET)) return false;
  return !withData.some((t) => t.probes.some((p) => p.ok));
}

/**
 * 线路级统计 = 该线路上各分组的平均水平。
 *
 * 早先试过「至少一个分组能通就算线路通」，会得出 99% 的漂亮数字，
 * 但下面每个分组都是黄的红的，自相矛盾。用户真正想知道的是
 * 「我用这条线路，成功率大概多少」，那就是各分组的平均。
 * 曲线取中位分组代表典型体验，跟平均值基本吻合。
 */
export function buildRouteStats(route: RouteDef, map: ProbeMap): RouteStats {
  const targets = GROUPS.map((g) => buildTargetStats(route, g, map.get(targetKey(route.id, g.id)) ?? []));

  // 没数据的分组不参与平均，否则会被当成 0% 把整条线路拖黑
  const withData = targets.filter((t) => t.hasData);
  const basis = withData.length ? withData : targets;

  const sorted = [...basis].sort((a, b) => a.uptime24h - b.uptime24h);
  const typical = sorted[Math.floor(sorted.length / 2)];
  const probes = typical.probes;

  const mean = (pick: (t: TargetStats) => number) => basis.reduce((acc, t) => acc + pick(t), 0) / basis.length;

  const uptime24h = mean((t) => t.uptime24h);
  const uptime1h = mean((t) => t.uptime1h);

  const counts = new Map<string, number>();
  targets.forEach((t) => {
    t.probes.forEach((p) => {
      if (p.errorCode) counts.set(p.errorCode, (counts.get(p.errorCode) ?? 0) + 1);
    });
  });

  const incidents = GROUPS.flatMap((g, idx) =>
    extractIncidents(route, g, targets[idx].probes),
  ).sort((a, b) => b.startedAt - a.startedAt);

  const current: HealthLevel = uptime1h >= 0.92 ? 'ok' : uptime1h >= 0.75 ? 'degraded' : 'down';

  return {
    route,
    likelyDead: isLikelyDead(targets),
    probes,
    targets,
    uptime24h,
    uptime1h,
    avgLatency: Math.round(mean((t) => t.avgLatency)),
    p95Latency: Math.round(mean((t) => t.p95Latency)),
    current,
    lastProbeAt: Math.max(...targets.map((t) => t.lastProbeAt), 0),
    errorBreakdown: [...counts.entries()]
      .map(([code, count]) => ({ code, label: ERROR_LABELS[code] ?? code, count }))
      .sort((a, b) => b.count - a.count),
    incidents,
  };
}

export function overallLevel(stats: RouteStats[]): HealthLevel {
  if (stats.length === 0) return 'ok';
  if (stats.every((s) => s.current === 'down')) return 'down';
  if (stats.some((s) => s.current === 'down' || s.current === 'degraded')) return 'degraded';
  return 'ok';
}

/** 挑出当前最值得用的线路 */
export function recommendRoute(stats: RouteStats[]): RouteStats {
  return [...stats].sort((a, b) => {
    if (a.current !== b.current) {
      const rank: Record<HealthLevel, number> = { ok: 0, degraded: 1, down: 2 };
      return rank[a.current] - rank[b.current];
    }
    return b.uptime1h - a.uptime1h;
  })[0];
}

export function recentIncidents(stats: RouteStats[], limit = 8): Incident[] {
  return stats
    .flatMap((s) => s.incidents)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
}

export function overallUptime(stats: RouteStats[]): number {
  const all = stats.flatMap((s) => s.targets.flatMap((t) => t.probes));
  return all.length ? all.filter((p) => p.ok).length / all.length : 1;
}

/** 按小时聚合的可用率，用来体现「什么时段最稳」 */
export function hourlyHeatmap(stats: RouteStats[]): HourBucket[] {
  const all = stats.flatMap((s) => s.targets.flatMap((t) => t.probes));
  const buckets = new Map<number, { ok: number; total: number }>();
  all.forEach((p) => {
    const h = new Date(p.ts).getHours();
    const b = buckets.get(h) ?? { ok: 0, total: 0 };
    b.total += 1;
    if (p.ok) b.ok += 1;
    buckets.set(h, b);
  });
  return [...buckets.entries()]
    .map(([hour, b]) => ({ hour, uptime: b.total ? b.ok / b.total : 1, samples: b.total }))
    .sort((a, b) => a.hour - b.hour);
}
