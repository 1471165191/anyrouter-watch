import { NextResponse } from 'next/server';
import { GROUPS, ROUTES } from '@/lib/config';
import { dbEnabled } from '@/lib/db';
import { insertProbes, type ProbeInput } from '@/lib/probes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** 3 个探测目标串行跑，每个最长 12 秒，留够余量 */
export const maxDuration = 60;

/**
 * 服务端探测端点 —— 让「谁来定时触发」这件事不再依赖 GitHub Actions。
 *
 * 为什么需要它（2026-09-22）：
 *   probe.yml 里的 5 分钟一次 cron 挂上去一个半小时，触发次数 **0**。
 *   GitHub 的 schedule 是尽力而为：新仓库、高负载时段都会延迟甚至直接丢掉，
 *   而且它不报错、workflow 状态还是 active，只能靠数 run 才看得出来没跑。
 *   对一个「每 5 分钟更新一次」的状态页来说，这是致命的。
 *
 * 现在的分工：
 *   · 这个端点负责「探测 + 落库」，是完整的一条链路，不依赖外部 runner
 *   · 触发交给任意一个靠谱的定时器（cron-job.org / UptimeRobot / Cloudflare
 *     Workers Cron 都行，免费档就能到 1 分钟粒度）
 *   · GitHub Actions 那份保留着当备份，哪边先恢复都不影响
 *
 * 鉴权：复用 INGEST_SECRET。支持请求头 x-ingest-secret，也支持
 * `?secret=` —— 因为多数免费定时器只会给你填一个 URL，加不了自定义头。
 *
 * 用法：
 *   curl -H "x-ingest-secret: $INGEST_SECRET" https://你的域名/api/probe
 *   curl "https://你的域名/api/probe?secret=$INGEST_SECRET"
 */

const PROBE_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 12000);

interface ProbeOutcome extends ProbeInput {
  excerpt: string;
}

function normalize(baseUrl: string): string {
  const root = baseUrl.replace(/\/+$/, '');
  return root.endsWith('/v1') ? root : `${root}/v1`;
}

/**
 * 分类。和 scripts/probe.mjs 的 classify 必须保持一致 ——
 * 两边的判据如果不一样，同一时刻 GitHub 探测和这个端点会给出不同的错误码。
 */
function classify(status: number, text: string): string {
  if (/in debt|欠费/i.test(text)) return 'debt';
  if (/1m\s*上下文/i.test(text)) return 'context';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  // 429 有两种，含义相反：真限流 vs 渠道打满。这个站过载时返回
  // 429 + "Service Unavailable"，归成 rate_limit 会给出错误的建议。
  if (status === 429) return /service unavailable|负载|overload/i.test(text) ? 'overload' : 'rate_limit';
  if (status === 502) return 'bad_gateway';
  if (status === 504) return 'timeout';
  if (status >= 500) return 'overload';
  if (/负载|overload|unavailable/i.test(text)) return 'overload';
  return 'unknown';
}

/** 按分组声明的 api 格式构造请求。Claude 必须带 anthropic-beta 头，见 lib/config.ts */
function buildRequest(
  api: string,
  model: string,
  key: string,
): { path: string; headers: Record<string, string>; body: unknown } {
  if (api === 'messages') {
    return {
      path: '/messages',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'context-1m-2025-08-07',
        'Content-Type': 'application/json',
      },
      body: { model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] },
    };
  }
  if (api === 'responses') {
    return {
      path: '/responses',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: { model, input: 'ping', max_output_tokens: 16, stream: false },
    };
  }
  return {
    path: '/chat/completions',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false },
  };
}

async function probeOne(
  routeId: string,
  baseUrl: string,
  groupId: string,
  api: string,
  model: string,
  key: string,
): Promise<ProbeOutcome> {
  const { path, headers, body } = buildRequest(api, model, key);
  const url = `${normalize(baseUrl)}${path}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: 'no-store',
    });
    const latencyMs = Date.now() - t0;
    let text = '';
    try {
      text = await res.text();
    } catch {
      /* 忽略 */
    }
    return {
      routeId,
      groupId,
      ok: res.ok,
      status: res.status,
      latencyMs: res.ok ? latencyMs : 0,
      errorCode: res.ok ? null : classify(res.status, text),
      excerpt: text.slice(0, 200),
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'TimeoutError';
    return {
      routeId,
      groupId,
      ok: false,
      status: 0,
      latencyMs: 0,
      errorCode: aborted ? 'timeout' : 'network',
      excerpt: aborted ? `超过 ${PROBE_TIMEOUT_MS}ms 无响应` : String(e).slice(0, 200),
    };
  }
}

async function run(secretFromQuery: string | null) {
  const secret = process.env.INGEST_SECRET;
  if (secret && secretFromQuery !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const key = process.env.ANYROUTER_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'ANYROUTER_KEY 未配置，无法探测。去 Vercel 项目设置里加上这个环境变量。' },
      { status: 500 },
    );
  }

  const results: ProbeOutcome[] = [];
  for (const route of ROUTES) {
    for (const group of GROUPS) {
      results.push(await probeOne(route.id, route.baseUrl, group.id, group.api, group.models[0], key));
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const summary = results.map((r) => ({
    target: `${r.routeId}:${r.groupId}`,
    ok: r.ok,
    status: r.status,
    latencyMs: r.latencyMs,
    errorCode: r.errorCode,
  }));

  if (!dbEnabled()) {
    return NextResponse.json({
      ok: true,
      probed: results.length,
      succeeded: okCount,
      stored: 0,
      note: 'DATABASE_URL 未配置，探测结果没有落库。',
      summary,
    });
  }

  try {
    const stored = await insertProbes(
      results.map(({ routeId, groupId, ok, status, latencyMs, errorCode }) => ({
        routeId,
        groupId,
        ok,
        status,
        latencyMs,
        errorCode,
      })),
      'vercel-probe',
      Date.now(),
    );
    return NextResponse.json({ ok: true, probed: results.length, succeeded: okCount, stored, summary });
  } catch (e) {
    console.error('[probe] insert failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: '探测成功但写库失败' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return run(url.searchParams.get('secret'));
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  return run(req.headers.get('x-ingest-secret') ?? url.searchParams.get('secret'));
}
