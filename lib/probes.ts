import { targetKey, type ProbeMap } from './aggregate';
import { GROUPS, ROUTES, WINDOW_HOURS } from './config';
import { query, safeQuery } from './db';
import { demoProbesForTarget } from './mock';
import type { Probe } from './types';

/**
 * 探测数据的取数层。
 *
 * 有数据库且库里已有数据 → 用真实数据（source: 'db'）
 * 没配数据库，或者库还是空的 → 用示例数据（source: 'demo'），页面上会明确标注
 *
 * 之所以要这个 fallback：站点刚上线时库里一条数据都没有，
 * 直接展示空图表会让人以为站点坏了。标注清楚就没问题。
 */

interface ProbeRow {
  route_id: string;
  group_id: string;
  ts: Date | string;
  ok: boolean;
  status: number;
  latency_ms: number;
  error_code: string | null;
}

export interface ProbeLoad {
  map: ProbeMap;
  source: 'db' | 'demo';
  rows: number;
}

export interface ProbeInput {
  routeId: string;
  groupId: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  errorCode?: string | null;
}

export async function loadProbes(hours = WINDOW_HOURS): Promise<ProbeLoad> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await safeQuery<ProbeRow>(
    `select route_id, group_id, ts, ok, status, latency_ms, error_code
       from probes
      where ts >= $1
      order by ts asc`,
    [since.toISOString()],
  );

  const map: ProbeMap = new Map();

  if (!rows || rows.length === 0) {
    for (const r of ROUTES) {
      for (const g of GROUPS) map.set(targetKey(r.id, g.id), demoProbesForTarget(r.id, g.id));
    }
    return { map, source: 'demo', rows: 0 };
  }

  for (const row of rows) {
    const key = targetKey(row.route_id, row.group_id);
    let list = map.get(key);
    if (!list) {
      list = [];
      map.set(key, list);
    }
    list.push({
      ts: new Date(row.ts).getTime(),
      ok: row.ok,
      status: row.status,
      latencyMs: row.latency_ms,
      errorCode: row.error_code,
    });
  }

  return { map, source: 'db', rows: rows.length };
}

/** 写入一批探测结果，供 /api/ingest 调用 */
export async function insertProbes(results: ProbeInput[], region: string | null, ts: number): Promise<number> {
  if (results.length === 0) return 0;

  const COLS = 8;
  const values: unknown[] = [];
  const chunks = results.map((r, i) => {
    const b = i * COLS;
    values.push(
      r.routeId,
      r.groupId,
      new Date(ts),
      r.ok,
      r.status,
      r.latencyMs,
      r.errorCode ?? null,
      region,
    );
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`;
  });

  await query(
    `insert into probes (route_id, group_id, ts, ok, status, latency_ms, error_code, region)
     values ${chunks.join(',')}`,
    values,
  );
  return results.length;
}
