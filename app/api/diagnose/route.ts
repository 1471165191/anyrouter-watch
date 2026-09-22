import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * 配置自检代理。
 *
 * 安全约定（改代码时务必保持）：
 *   1. 用户的 key 只存在于本次请求的内存里，不写数据库、不写日志、不落任何存储
 *   2. 不在这里 console.log 任何请求体
 *   3. 不做任何重试缓存，请求结束即丢弃
 */

interface StepResult {
  name: string;
  ok: boolean;
  detail: string;
  httpStatus?: number;
  latencyMs?: number;
}

const TIMEOUT_MS = 8000;

function normalizeBase(raw: string): { root: string; v1: string } {
  const root = raw.trim().replace(/\/+$/, '');
  const v1 = root.endsWith('/v1') ? root : `${root}/v1`;
  return { root, v1 };
}

async function timed(url: string, init: RequestInit): Promise<{ res: Response | null; ms: number; err: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
    return { res, ms: Date.now() - t0, err: '' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      res: null,
      ms: Date.now() - t0,
      err: msg.includes('abort') ? `超过 ${TIMEOUT_MS / 1000} 秒没有响应` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  let body: { baseUrl?: string; apiKey?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }

  const baseUrl = (body.baseUrl ?? '').trim();
  const apiKey = (body.apiKey ?? '').trim();
  const model = (body.model ?? '').trim();

  if (!/^https?:\/\//i.test(baseUrl)) {
    return NextResponse.json({ error: '接口地址要以 http:// 或 https:// 开头' }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: '请填 API key' }, { status: 400 });
  }

  const { v1 } = normalizeBase(baseUrl);
  const steps: StepResult[] = [];

  // 第一步：网络能不能通
  const conn = await timed(v1, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!conn.res) {
    steps.push({
      name: '网络连通',
      ok: false,
      detail: `连不上 ${v1}（${conn.err}）。主站直连需要科学上网；如果没开代理，换「大陆优化」线路再试。`,
      latencyMs: conn.ms,
    });
    return NextResponse.json({ steps, conclusion: 'network', v1 });
  }
  steps.push({
    name: '网络连通',
    ok: true,
    detail: `已连上，返回 HTTP ${conn.res.status}`,
    httpStatus: conn.res.status,
    latencyMs: conn.ms,
  });

  // 第二步：key 有没有效
  const auth = await timed(`${v1}/models`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });

  if (!auth.res) {
    steps.push({
      name: '鉴权校验',
      ok: false,
      detail: `请求 /models 失败（${auth.err}），可能是线路抖动，稍后重试。`,
      latencyMs: auth.ms,
    });
    return NextResponse.json({ steps, conclusion: 'flaky', v1 });
  }

  if (auth.res.status === 401 || auth.res.status === 403) {
    steps.push({
      name: '鉴权校验',
      ok: false,
      detail: `key 被拒绝（HTTP ${auth.res.status}）。检查 key 有没有复制全、有没有多余空格、是不是别的站的 key。`,
      httpStatus: auth.res.status,
      latencyMs: auth.ms,
    });
    return NextResponse.json({ steps, conclusion: 'auth', v1 });
  }

  if (auth.res.status >= 500) {
    steps.push({
      name: '鉴权校验',
      ok: false,
      detail: `服务端返回 ${auth.res.status}，这是中转站那边的问题，不是你的配置问题。`,
      httpStatus: auth.res.status,
      latencyMs: auth.ms,
    });
    return NextResponse.json({ steps, conclusion: 'upstream', v1 });
  }

  let modelCount = 0;
  let hasModel = true;
  try {
    const data = (await auth.res.json()) as { data?: { id?: string }[] };
    const ids = (data.data ?? []).map((m) => m.id).filter(Boolean) as string[];
    modelCount = ids.length;
    if (model) hasModel = ids.some((id) => id === model);
  } catch {
    // 有些站不返回标准结构，忽略
  }

  steps.push({
    name: '鉴权校验',
    ok: true,
    detail: `key 有效，该站返回 ${modelCount || '若干'} 个可用模型${model && !hasModel ? `，但列表里没有 ${model}` : ''}`,
    httpStatus: auth.res.status,
    latencyMs: auth.ms,
  });

  if (model && !hasModel) {
    steps.push({
      name: '模型名核对',
      ok: false,
      detail: `「${model}」不在可用模型列表里。模型名写错是仅次于代理问题的第二大坑，复制官方模型名再试。`,
    });
    return NextResponse.json({ steps, conclusion: 'model', v1, modelCount });
  }

  // 第三步：真打一次补全，这才算真的能用
  const chat = await timed(`${v1}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
      stream: false,
    }),
  });

  if (!chat.res) {
    steps.push({
      name: '真实调用',
      ok: false,
      detail: `补全请求失败（${chat.err}）。如果 /models 能过但补全超时，通常是上游负载太高，换个时段再试。`,
      latencyMs: chat.ms,
    });
    return NextResponse.json({ steps, conclusion: 'flaky', v1 });
  }

  if (!chat.res.ok) {
    let msg = '';
    try {
      const errBody = (await chat.res.json()) as { error?: { message?: string }; message?: string };
      msg = errBody.error?.message ?? errBody.message ?? '';
    } catch {
      /* 忽略解析失败 */
    }
    const hint =
      chat.res.status === 429
        ? '触发限流，等一会儿或降低频率。'
        : chat.res.status === 402 || chat.res.status === 403
          ? '多半是额度或权限问题，去后台看余额。'
          : chat.res.status >= 500
            ? '中转站上游的问题，跟你没关系。'
            : '';
    steps.push({
      name: '真实调用',
      ok: false,
      detail: `HTTP ${chat.res.status}${msg ? ` — ${msg.slice(0, 200)}` : ''}。${hint}`,
      httpStatus: chat.res.status,
      latencyMs: chat.ms,
    });
    return NextResponse.json({ steps, conclusion: 'upstream', v1 });
  }

  steps.push({
    name: '真实调用',
    ok: true,
    detail: `补全成功，往返 ${chat.ms}ms。你的配置没问题，可以正常用。`,
    httpStatus: chat.res.status,
    latencyMs: chat.ms,
  });

  return NextResponse.json({ steps, conclusion: 'ok', v1, modelCount });
}
