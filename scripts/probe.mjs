#!/usr/bin/env node
/**
 * 探测脚本：对每个「线路 × 分组」发一次最小请求，记录结果并回传。
 *
 * 为什么不用 Vercel 自带的 Cron：
 *   Hobby 计划的定时任务一天只能触发一次，做不了 5 分钟粒度。
 *   所以调度交给 GitHub Actions（最小 5 分钟）或 Cloudflare Workers Cron。
 *
 * 用法：
 *   ANYROUTER_KEY=sk-xxx INGEST_URL=https://你的域名/api/ingest INGEST_SECRET=xxx node scripts/probe.mjs
 *
 * 本地只看结果不回传：
 *   ANYROUTER_KEY=sk-xxx node scripts/probe.mjs --dry
 *
 * ⚠️ 端点格式很关键（2026-09-22 踩过）：
 *   AnyRouter 不同模型族走的接口不一样。**模型名对了但端点不对，同样返回
 *   `404 当前 API 不支持所选模型`** —— 看起来像模型不存在，其实是打错了接口。
 *   实测：
 *     Claude  → POST /v1/messages          （Anthropic 格式，x-api-key 头
 *                                            + anthropic-beta: context-1m-2025-08-07）
 *     GPT     → POST /v1/responses         （OpenAI 新格式，input 而不是 messages）
 *     Gemini  → POST /v1/chat/completions  （OpenAI 经典格式）
 *   改模型前先用 `GET /v1/models` 核对一遍，**而且要用 --dry 真打一次** ——
 *   列表里有不等于真能调（gemini-2.5-flash 不在列表里、gpt-5-codex 在列表里但 404）。
 *
 * 注意：探测用的是你自己的账号和额度，保持低频，别给人家添负担。
 */

const KEY = process.env.ANYROUTER_KEY;
const INGEST_URL = process.env.INGEST_URL;
const INGEST_SECRET = process.env.INGEST_SECRET;
const DRY = process.argv.includes('--dry');
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 15000);

/**
 * ⚠️ 这份 ROUTES 必须和 lib/config.ts 里的 ROUTES 完全一致。
 * 只写实测过能用的地址 —— 2026-09-22 曾把三条错地址（404 / 欠费 / 连不上）
 * 当成正经线路探测了两轮，页面上白显示了一堆红。
 */
const ROUTES = [
  { id: 'main', name: '主站直连', baseUrl: 'https://anyrouter.top' },
];

// 每个分组只用第一个模型探测，控制请求量。
// 候选写在数组里是为了留个换模型的余地，不是每个都发。
// ⚠️ 只放实测能打通的模型 —— 列表里有 ≠ 真能调，见 lib/config.ts 的说明。
const GROUPS = [
  { id: 'claude', api: 'messages', models: ['claude-sonnet-4-5-20250929'] },
  { id: 'gpt', api: 'responses', models: ['gpt-6-astra'] },
  { id: 'gemini', api: 'chat', models: ['gemini-2.5-pro'] },
];

if (!KEY) {
  console.error('缺少 ANYROUTER_KEY 环境变量');
  process.exit(1);
}

function normalize(baseUrl) {
  const root = baseUrl.replace(/\/+$/, '');
  return root.endsWith('/v1') ? root : `${root}/v1`;
}

function classify(status, text) {
  // 欠费要单独认出来 —— 它是「这条线路暂时别用了」，不是普通的鉴权失败
  if (/in debt|欠费/i.test(text)) return 'debt';
  // 「请启用 1m 上下文」是配置问题，不是故障，得单独报出来，
  // 否则会混在 400 里被当成上游抽风
  if (/1m\s*上下文/i.test(text)) return 'context';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  // 429 有两种，含义完全相反，必须分开：
  //   真·限流  → 改客户端（降并发、关自动重试）
  //   渠道打满 → 只能等，改什么都没用
  // 这个站过载时返回的正是 `429 + {"message":"Service Unavailable"}`，
  // 一律归成 rate_limit 会给出错误的建议（2026-09-22 实测）。
  if (status === 429) return /service unavailable|负载|overload/i.test(text) ? 'overload' : 'rate_limit';
  if (status === 502) return 'bad_gateway';
  if (status === 504) return 'timeout';
  if (status >= 500) return 'overload';
  if (/负载|overload|unavailable/i.test(text)) return 'overload';
  return 'unknown';
}

/**
 * 按分组声明的 api 格式，构造这次探测的路径 / 请求头 / 请求体。
 *
 * ⚠️ Claude 必须带 `anthropic-beta: context-1m-2025-08-07`。
 * 2026-09-22 实测：不带这个头，所有 Claude 模型都返回
 * `400 1m 上下文已经全量可用，请启用 1m 上下文后重试`（3/3 稳定复现）；
 * 带上之后错误才变成真正的上游状态码（当时是 503 过载）。
 */
function buildRequest(api, model) {
  if (api === 'messages') {
    return {
      path: '/messages',
      headers: {
        'x-api-key': KEY,
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
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: { model, input: 'ping', max_output_tokens: 16, stream: false },
    };
  }
  return {
    path: '/chat/completions',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: {
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
      stream: false,
    },
  };
}

async function probe(route, group) {
  const model = group.models[0];
  const { path, headers, body } = buildRequest(group.api, model);
  const url = `${normalize(route.baseUrl)}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers,
      body: JSON.stringify(body),
    });
    const latencyMs = Date.now() - t0;
    let text = '';
    try {
      text = await res.text();
    } catch {
      /* 忽略 */
    }
    return {
      routeId: route.id,
      groupId: group.id,
      ok: res.ok,
      status: res.status,
      latencyMs: res.ok ? latencyMs : 0,
      errorCode: res.ok ? null : classify(res.status, text),
      excerpt: text.slice(0, 200),
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return {
      routeId: route.id,
      groupId: group.id,
      ok: false,
      status: 0,
      latencyMs: 0,
      errorCode: aborted ? 'timeout' : 'network',
      excerpt: aborted ? `超过 ${TIMEOUT_MS}ms 无响应` : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const results = [];
  for (const route of ROUTES) {
    for (const group of GROUPS) {
      const r = await probe(route, group);
      results.push(r);
      const mark = r.ok ? 'OK ' : 'FAIL';
      console.log(
        `${mark} ${route.name.padEnd(12)} ${group.id.padEnd(9)} ${String(r.status).padEnd(4)} ${r.latencyMs}ms ${r.errorCode ?? ''}`,
      );
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n汇总：${okCount}/${results.length} 成功`);

  if (DRY || !INGEST_URL) {
    console.log(INGEST_URL ? '（dry run，未回传）' : '未配置 INGEST_URL，跳过回传');
    return;
  }

  const res = await fetch(INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(INGEST_SECRET ? { 'x-ingest-secret': INGEST_SECRET } : {}),
    },
    body: JSON.stringify({ ts: Date.now(), region: process.env.PROBE_REGION ?? 'github-actions', results }),
  });
  console.log(`回传结果：HTTP ${res.status}`);
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
