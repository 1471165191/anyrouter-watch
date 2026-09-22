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
 *     Claude  → POST /v1/messages          （Anthropic 格式，x-api-key 头）
 *     GPT     → POST /v1/responses         （OpenAI 新格式，input 而不是 messages）
 *     Gemini  → POST /v1/chat/completions  （OpenAI 经典格式）
 *   改模型前先用 `GET /v1/models` 核对一遍，别再照抄社区帖子里的模型名。
 *
 * 注意：探测用的是你自己的账号和额度，保持低频，别给人家添负担。
 */

const KEY = process.env.ANYROUTER_KEY;
const INGEST_URL = process.env.INGEST_URL;
const INGEST_SECRET = process.env.INGEST_SECRET;
const DRY = process.argv.includes('--dry');
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 15000);

const ROUTES = [
  { id: 'main', name: '主站直连', baseUrl: 'https://anyrouter.top' },
  { id: 'cn-a', name: '大陆优化 A', baseUrl: 'https://pmpjfbhq.cn-nb1.rainapp.top' },
  { id: 'cn-b', name: '大陆优化 B', baseUrl: 'https://a-ocnfniawgw.cn-shanghai.fcapp.run' },
  { id: 'cdn', name: 'CDN 备用', baseUrl: 'https://q.quuvv.cn' },
];

// 每个分组只用第一个模型探测，控制请求量。
// 候选写在数组里是为了留个换模型的余地，不是每个都发。
const GROUPS = [
  { id: 'claude', api: 'messages', models: ['claude-3-5-haiku-20241022'] },
  { id: 'gpt', api: 'responses', models: ['gpt-6-astra'] },
  { id: 'gemini', api: 'chat', models: ['gemini-2.5-flash'] },
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
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limit';
  if (status === 502) return 'bad_gateway';
  if (status === 504) return 'timeout';
  if (status >= 500) return 'overload';
  if (/负载|overload|unavailable/i.test(text)) return 'overload';
  return 'unknown';
}

/** 按分组声明的 api 格式，构造这次探测的路径 / 请求头 / 请求体 */
function buildRequest(api, model) {
  if (api === 'messages') {
    return {
      path: '/messages',
      headers: {
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
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
