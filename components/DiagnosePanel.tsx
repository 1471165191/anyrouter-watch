'use client';

import { useState } from 'react';
import { ROUTES } from '@/lib/config';

interface StepResult {
  name: string;
  ok: boolean;
  detail: string;
  httpStatus?: number;
  latencyMs?: number;
}

interface DiagResponse {
  steps: StepResult[];
  conclusion?: string;
  v1?: string;
  /** 实际探测用的端点，例如 /v1/messages。不同模型族端点不同 */
  endpoint?: string;
  error?: string;
}

const CONCLUSION_TIP: Record<string, { level: 'ok' | 'warn' | 'bad'; title: string; body: string }> = {
  ok: {
    level: 'ok',
    title: '你的配置没问题',
    body: '三步全过。如果客户端里还是报错，那就是客户端自己的设置问题（比如开了代理但没走对规则、模型名填的是别名、上下文超长）。',
  },
  network: {
    level: 'bad',
    title: '卡在第一步：连不上服务器',
    body: '这跟你的 key 和模型名都没关系。主站直连必须开代理；如果不想开代理，换成大陆优化线路再试一次。',
  },
  auth: {
    level: 'bad',
    title: '卡在第二步：key 无效',
    body: '地址是对的，key 被拒了。重新复制一遍完整 key，注意别带空格和换行；也确认这个 key 是这个站的。',
  },
  model: {
    level: 'bad',
    title: '卡在第三步：模型名或端点不对',
    body: 'key 是好的，但这个模型走不通。两种可能：一是模型名在列表里找不到（去站内模型列表复制准确的名字，注意大小写和日期后缀）；二是端点选错了 —— 这类站 Claude 走 /v1/messages、GPT 走 /v1/responses、其余走 /v1/chat/completions，用错了同样报「不支持所选模型」。上面每一步的详情里写了本次实际打的地址，照着改。',
  },
  upstream: {
    level: 'warn',
    title: '不是你的问题，是中转站那边挂了',
    body: '请求已经正确发出去了，是上游返回的错误。换个线路或换个时段再试，也可以去状态页看看现在是不是大家都这样。',
  },
  flaky: {
    level: 'warn',
    title: '请求不稳定，多半是负载太高',
    body: '有时通有时不通，典型的过载表现。降低并发、缩短上下文，或者挑凌晨这类低峰时段。',
  },
};

export default function DiagnosePanel() {
  const [baseUrl, setBaseUrl] = useState(ROUTES[1].baseUrl);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DiagResponse | null>(null);
  const [error, setError] = useState('');

  async function run() {
    if (!baseUrl.trim() || !apiKey.trim()) {
      setError('接口地址和 key 都要填');
      return;
    }
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey, model }),
      });
      const data = (await res.json()) as DiagResponse;
      if (!res.ok) throw new Error(data.error ?? '自检失败');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '自检失败，稍后再试');
    } finally {
      setBusy(false);
    }
  }

  const v1 = result?.v1 ?? (baseUrl.trim().replace(/\/+$/, '').endsWith('/v1')
    ? baseUrl.trim().replace(/\/+$/, '')
    : `${baseUrl.trim().replace(/\/+$/, '')}/v1`);

  // 手动验证用的 curl 也要按模型族换端点 —— 否则用户照着这条命令敲，
  // 明明配置是对的也会拿到「不支持所选模型」，反而被带偏。
  const defaultModel = 'gemini-2.5-flash';
  const used = (model || defaultModel).toLowerCase();
  const isClaude = used.startsWith('claude');
  const isGpt = used.startsWith('gpt') || /^o[134]/.test(used);
  const curlModel = model || defaultModel;

  const curl = isClaude
    ? `curl ${v1}/messages \\
  -H "x-api-key: $ANYROUTER_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${curlModel}","max_tokens":1,"messages":[{"role":"user","content":"ping"}]}'`
    : isGpt
      ? `curl ${v1}/responses \\
  -H "Authorization: Bearer $ANYROUTER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${curlModel}","input":"ping","max_output_tokens":16}'`
      : `curl ${v1}/chat/completions \\
  -H "Authorization: Bearer $ANYROUTER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${curlModel}","messages":[{"role":"user","content":"ping"}],"max_tokens":1}'`;

  const tip = result?.conclusion ? CONCLUSION_TIP[result.conclusion] : null;

  return (
    <div>
      <div className="field">
        <label>接口地址（base_url）</label>
        <input
          className="input"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://anyrouter.top"
          spellCheck={false}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
          {ROUTES.map((r) => (
            <button
              key={r.id}
              type="button"
              className="btn ghost sm"
              onClick={() => setBaseUrl(r.baseUrl)}
              title={r.note}
            >
              {r.name}
            </button>
          ))}
        </div>
        <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>
          不用纠结结尾要不要带 /v1，两种写法自检都会自动纠正。
        </div>
      </div>

      <div className="field">
        <label>API key</label>
        <input
          className="input mono"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="field">
        <label>模型名（可选，填了会额外核对）</label>
        <input
          className="input mono"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="claude-sonnet-4-20250514"
          spellCheck={false}
        />
      </div>

      <div className="alert warn" style={{ marginBottom: 14 }}>
        <b>关于你的 key</b>
        <div className="dim" style={{ marginTop: 4 }}>
          key 只在本次请求的内存里用一次，转发完就丢，不写数据库、不写日志、不缓存。不放心的话，
          下面的 curl 命令可以复制到本地自己跑，效果完全一样。
        </div>
      </div>

      <button className="btn" onClick={run} disabled={busy}>
        {busy ? '正在自检…' : '开始自检'}
      </button>

      {error ? (
        <div className="alert bad" style={{ marginTop: 14 }}>
          {error}
        </div>
      ) : null}

      {result?.steps ? (
        <div className="card" style={{ marginTop: 16 }}>
          {result.steps.map((s, i) => (
            <div key={s.name} className={`step ${s.ok ? 'ok' : 'fail'}`}>
              <div className="step-idx">{s.ok ? '✓' : '×'}</div>
              <div>
                <div className="step-title">
                  {i + 1}. {s.name}
                  {s.latencyMs !== undefined ? (
                    <span className="faint" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                      {s.latencyMs}ms
                    </span>
                  ) : null}
                </div>
                <div className="step-detail">{s.detail}</div>
              </div>
            </div>
          ))}

          {tip ? (
            <div className={`alert ${tip.level}`} style={{ marginTop: 14 }}>
              <b>{tip.title}</b>
              <div className="dim" style={{ marginTop: 4 }}>
                {tip.body}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginTop: 26 }}>
        <div className="section-head">
          <h3>或者自己在本地跑</h3>
          <span className="hint">不想把 key 交给任何网站的话，用这条命令</span>
        </div>
        <div className="code">{curl}</div>
        <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
          把 <span className="mono">$ANYROUTER_KEY</span> 换成你自己的 key。返回 200 且有内容，说明配置完全正常。
        </div>
      </div>
    </div>
  );
}
