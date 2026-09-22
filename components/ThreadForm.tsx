'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GROUPS, ROUTES } from '@/lib/config';

export default function ThreadForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [nick, setNick] = useState('');
  const [routeId, setRouteId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          nick: nick.trim() || null,
          routeId: routeId || null,
          groupId: groupId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '发帖失败');
      setTitle('');
      setBody('');
      router.push(`/discuss/${data.thread.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '发帖失败，稍后再试');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        发个帖子
      </button>
    );
  }

  return (
    <div>
      <div className="field">
        <label>标题（必填）— 一句话说清楚问题</label>
        <input
          className="input"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：claude 分组下午开始一直 502，有人一样吗"
        />
      </div>

      <div className="field">
        <label>正文（必填）— 现象、报错原文、你试过什么</label>
        <textarea
          className="textarea"
          style={{ minHeight: 130 }}
          value={body}
          maxLength={4000}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            '把你看到的原样贴出来，比「用不了」有用一百倍：\n' +
            '· 报错原文是什么\n' +
            '· 换过哪条线路、哪个客户端\n' +
            '· 什么时候开始的'
          }
        />
      </div>

      <div className="grid-2" style={{ gap: 12 }}>
        <div className="field">
          <label>昵称（可选）</label>
          <input
            className="input"
            value={nick}
            maxLength={24}
            onChange={(e) => setNick(e.target.value)}
            placeholder="不填就是匿名"
          />
        </div>
        <div className="field">
          <label>挂到哪条线路（可选）</label>
          <select className="select" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">不挂 / 通用问题</option>
            {ROUTES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>挂到哪个分组（可选）</label>
          <select className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">不挂 / 通用问题</option>
            {GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="alert bad" style={{ marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn" onClick={submit} disabled={busy}>
          {busy ? '发布中…' : '发布'}
        </button>
        <button className="btn ghost" onClick={() => setOpen(false)} disabled={busy}>
          取消
        </button>
        <span className="faint" style={{ fontSize: 12 }}>
          不用注册，但请不要贴 API key
        </span>
      </div>
    </div>
  );
}
