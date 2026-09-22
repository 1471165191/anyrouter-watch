'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CLIENTS, GROUPS, NETWORKS, ROUTES, VERDICT_LABEL } from '@/lib/config';
import type { Verdict } from '@/lib/types';

const VERDICTS: Verdict[] = ['ok', 'slow', 'down'];

const ICON: Record<Verdict, string> = { ok: '✓', slow: '~', down: '×' };
const ICON_BG: Record<Verdict, string> = { ok: '#3fb950', slow: '#d29922', down: '#f85149' };

export default function ReportForm() {
  const router = useRouter();
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [routeId, setRouteId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [client, setClient] = useState('');
  const [network, setNetwork] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!verdict) {
      setError('先选一下现在的实际情况');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verdict,
          routeId: routeId || null,
          routeName: ROUTES.find((r) => r.id === routeId)?.name ?? null,
          groupId: groupId || null,
          groupName: GROUPS.find((g) => g.id === groupId)?.name ?? null,
          client: client || null,
          network: network || null,
          message: message.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '上报失败');
      setDone(true);
      setVerdict(null);
      setMessage('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '上报失败，稍后再试');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="alert ok">
        <b>收到，谢谢。</b>
        <div className="dim" style={{ marginTop: 4 }}>
          你的反馈已经计入实时统计，别人现在就能看到。
        </div>
        <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setDone(false)}>
          再报一条
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="field">
        <label>你现在的情况（必选）</label>
        <div className="verdict-row">
          {VERDICTS.map((v) => (
            <button
              key={v}
              type="button"
              className={`verdict-btn ${verdict === v ? `sel-${v}` : ''}`}
              onClick={() => setVerdict(v)}
            >
              <span className="verdict-icon" style={{ background: ICON_BG[v] }}>
                {ICON[v]}
              </span>
              {VERDICT_LABEL[v]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ gap: 12 }}>
        <div className="field">
          <label>用的哪条线路</label>
          <select className="select" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">不确定 / 没注意</option>
            {ROUTES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>用的哪个分组</label>
          <select className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">不确定 / 没注意</option>
            {GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>客户端</label>
          <select className="select" value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">不确定 / 没注意</option>
            {CLIENTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>网络环境</label>
          <select className="select" value={network} onChange={(e) => setNetwork(e.target.value)}>
            <option value="">不确定 / 没注意</option>
            {NETWORKS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>补充说明（可选）— 报错原文直接贴进来最有价值</label>
        <textarea
          className="textarea"
          value={message}
          maxLength={300}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="例如：报「上游负载压力太大」，换大陆优化线路后正常 / 一直 502，重试也没用"
        />
      </div>

      {error ? (
        <div className="alert bad" style={{ marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      <button className="btn" onClick={submit} disabled={busy}>
        {busy ? '提交中…' : '提交上报'}
      </button>
      <span className="faint" style={{ marginLeft: 12, fontSize: 12 }}>
        不收集账号、不收集 key、不记录 IP
      </span>
    </div>
  );
}
