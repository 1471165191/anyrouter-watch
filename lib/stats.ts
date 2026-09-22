import {
  buildRouteStats,
  hourlyHeatmap,
  overallLevel,
  overallUptime,
  recentIncidents,
  recommendRoute,
} from './aggregate';
import { ROUTES } from './config';
import { loadProbes } from './probes';
import type { HealthLevel, HourBucket, Incident, RouteStats } from './types';

/**
 * 页面用的统一取数入口。
 * 页面只调这一个函数，不关心数据是来自数据库还是示例生成器。
 */

export interface SiteStats {
  routes: RouteStats[];
  heatmap: HourBucket[];
  level: HealthLevel;
  uptime24h: number;
  incidents: Incident[];
  recommended: RouteStats;
  /** db = 真实探测数据，demo = 示例数据（数据库为空时的兜底） */
  source: 'db' | 'demo';
  lastProbeAt: number;
  sampleRows: number;
}

export async function getSiteStats(): Promise<SiteStats> {
  const { map, source, rows } = await loadProbes();
  const routes = ROUTES.map((r) => buildRouteStats(r, map));

  return {
    routes,
    heatmap: hourlyHeatmap(routes),
    level: overallLevel(routes),
    uptime24h: overallUptime(routes),
    incidents: recentIncidents(routes, 8),
    recommended: recommendRoute(routes),
    source,
    lastProbeAt: Math.max(...routes.map((r) => r.lastProbeAt), 0),
    sampleRows: rows,
  };
}
