import { createHash } from 'node:crypto';
import { CLIENTS, GROUPS, NETWORKS, ROUTES } from './config';
import { dbEnabled, query, safeQuery } from './db';
import type { UserReport, Verdict } from './types';

/**
 * 用户上报存储。
 *
 * 配了 DATABASE_URL 就走 Postgres；没配就用进程内内存（本地开发足够）。
 * 内存版在 serverless 上不跨实例共享，正式上线必须配数据库。
 */

const g = globalThis as unknown as { __awReports?: UserReport[] };

/** 数据库写入失败时抛出，由 API 层翻译成对用户友好的提示 */
export class StoreUnavailableError extends Error {
  constructor() {
    super('存储暂时不可用');
    this.name = 'StoreUnavailableError';
  }
}

interface ReportRow {
  id: string | number;
  ts: Date | string;
  verdict: Verdict;
  route_id: string | null;
  route_name: string | null;
  group_id: string | null;
  group_name: string | null;
  model: string | null;
  client: string | null;
  network: string | null;
  message: string | null;
}

function toReport(r: ReportRow): UserReport {
  return {
    id: String(r.id),
    ts: new Date(r.ts).getTime(),
    verdict: r.verdict,
    routeId: r.route_id,
    routeName: r.route_name,
    groupId: r.group_id,
    groupName: r.group_name,
    model: r.model,
    client: r.client,
    network: r.network,
    message: r.message,
  };
}

// ---------------------------------------------------------------- 示例数据

const DEMO_VERDICTS: Verdict[] = ['ok', 'ok', 'ok', 'ok', 'slow', 'down', 'ok', 'ok', 'slow', 'ok'];
const DEMO_MSGS = [
  '刚试了一下，秒回，正常',
  '有点慢，但是能用',
  '一直 502，换了线路也不行',
  '429 报错，估计是限流',
  '等了半分钟才出字',
  '客户端一直转圈，换网页版正常',
  '下午开始就不行了',
  '重启客户端之后好了',
  null,
  null,
  '超时，重试三次都失败',
  null,
  '报「上游负载压力太大」，等了十分钟再试就好了',
  '忘了开代理，开上就通了',
  null,
];

function hash(n: number): number {
  const x = Math.sin(n * 45.164 + 11.7) * 28913.231;
  return x - Math.floor(x);
}

function seedReports(): UserReport[] {
  const now = Date.now();
  const out: UserReport[] = [];
  for (let i = 0; i < 42; i += 1) {
    const r1 = hash(i * 3.1);
    const r2 = hash(i * 7.7 + 2);
    const r3 = hash(i * 11.3 + 5);
    const r4 = hash(i * 13.9 + 9);
    const minutesAgo = Math.round(Math.pow(r1, 2.2) * 170) + i;
    const route = ROUTES[Math.floor(hash(i * 23.7 + 4) * ROUTES.length)];
    const group = GROUPS[Math.floor(r4 * GROUPS.length)];
    out.push({
      id: `demo-${i}`,
      ts: now - minutesAgo * 60 * 1000,
      verdict: DEMO_VERDICTS[Math.floor(r2 * DEMO_VERDICTS.length)],
      routeId: route.id,
      routeName: route.name,
      groupId: group.id,
      groupName: group.name,
      model: null,
      client: CLIENTS[Math.floor(hash(i * 17.5) * CLIENTS.length)],
      network: NETWORKS[Math.floor(hash(i * 19.3 + 3) * NETWORKS.length)],
      message: DEMO_MSGS[Math.floor(r3 * DEMO_MSGS.length)],
    });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

function memoryList(): UserReport[] {
  if (!g.__awReports) g.__awReports = seedReports();
  return g.__awReports;
}

// ---------------------------------------------------------------- 读

export interface ReportLoad {
  reports: UserReport[];
  source: 'db' | 'demo';
}

export async function loadReports(limit = 40): Promise<ReportLoad> {
  const rows = await safeQuery<ReportRow>(
    `select id, ts, verdict, route_id, route_name, group_id, group_name, model, client, network, message
       from reports
      order by ts desc
      limit $1`,
    [limit],
  );

  if (rows && rows.length > 0) {
    return { reports: rows.map(toReport), source: 'db' };
  }
  return { reports: memoryList().slice(0, limit), source: 'demo' };
}

// ---------------------------------------------------------------- 写

export interface ReportInput {
  verdict: Verdict;
  routeId?: string | null;
  routeName?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  model?: string | null;
  client?: string | null;
  network?: string | null;
  message?: string | null;
}

export async function addReport(input: ReportInput): Promise<UserReport> {
  const message = input.message?.slice(0, 300) ?? null;

  if (dbEnabled()) {
    try {
      const rows = await query<ReportRow>(
        `insert into reports (verdict, route_id, route_name, group_id, group_name, model, client, network, message)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         returning id, ts, verdict, route_id, route_name, group_id, group_name, model, client, network, message`,
        [
          input.verdict,
          input.routeId ?? null,
          input.routeName ?? null,
          input.groupId ?? null,
          input.groupName ?? null,
          input.model ?? null,
          input.client ?? null,
          input.network ?? null,
          message,
        ],
      );
      return toReport(rows[0]);
    } catch (e) {
      // 配了库但写不进去。不要偷偷存到内存里假装成功 ——
      // 上报数据本身就是这个站的价值，丢了必须让用户知道。
      console.error('[store] insert report failed:', e instanceof Error ? e.message : e);
      throw new StoreUnavailableError();
    }
  }

  const report: UserReport = {
    id: `u-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    ts: Date.now(),
    verdict: input.verdict,
    routeId: input.routeId ?? null,
    routeName: input.routeName ?? null,
    groupId: input.groupId ?? null,
    groupName: input.groupName ?? null,
    model: input.model ?? null,
    client: input.client ?? null,
    network: input.network ?? null,
    message,
  };
  const list = memoryList();
  list.unshift(report);
  if (list.length > 500) list.length = 500;
  return report;
}

// ---------------------------------------------------------------- 限频

/**
 * 限频。存的是 IP 的哈希，不是 IP 本身 —— 既不收集个人信息，又能挡住刷屏。
 * 返回还需要等待的秒数，0 表示可以提交。
 */
const memoryThrottle = new Map<string, number>();

function hashIp(ip: string): string {
  const salt = process.env.INGEST_SECRET ?? 'anyrouter-watch';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

export async function throttleRemaining(ip: string, cooldownMs: number): Promise<number> {
  const key = hashIp(ip);

  if (dbEnabled()) {
    const rows = await safeQuery<{ prev_seen: Date | null }>(
      `with prev as (select last_seen from report_throttle where ip_hash = $1)
       insert into report_throttle (ip_hash, last_seen) values ($1, now())
       on conflict (ip_hash) do update set last_seen = now()
       returning (select last_seen from prev) as prev_seen`,
      [key],
    );
    if (rows) {
      const prev = rows[0]?.prev_seen ? new Date(rows[0].prev_seen).getTime() : 0;
      const remain = prev ? cooldownMs - (Date.now() - prev) : 0;
      return remain > 0 ? Math.ceil(remain / 1000) : 0;
    }
    // 查询失败就退回内存限频，不要因为限频本身把上报功能搞挂
  }

  const prev = memoryThrottle.get(key);
  const now = Date.now();
  if (prev && now - prev < cooldownMs) return Math.ceil((cooldownMs - (now - prev)) / 1000);
  memoryThrottle.set(key, now);
  if (memoryThrottle.size > 5000) memoryThrottle.clear();
  return 0;
}

// ---------------------------------------------------------------- 汇总

export interface ReportSummary {
  total: number;
  ok: number;
  slow: number;
  down: number;
  okRate: number;
  latestAt: number | null;
}

export function summarize(reports: UserReport[], withinMs = 60 * 60 * 1000): ReportSummary {
  const since = Date.now() - withinMs;
  const recent = reports.filter((r) => r.ts >= since);
  const ok = recent.filter((r) => r.verdict === 'ok').length;
  const slow = recent.filter((r) => r.verdict === 'slow').length;
  const down = recent.filter((r) => r.verdict === 'down').length;
  const total = recent.length;
  return {
    total,
    ok,
    slow,
    down,
    okRate: total ? ok / total : 0,
    latestAt: reports.length ? reports[0].ts : null,
  };
}
