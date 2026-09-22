'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ReplyForm({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/threads/${threadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), nick: nick.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '回复失败');
      setBody('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '回复失败，稍后再试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="field">
        <label>回一句</label>
        <textarea
          className="textarea"
          value={body}
          maxLength={2000}
          onChange={(e) => setBody(e.target.value)}
          placeholder="我这边也是 / 换个线路试试 / 已经恢复了"
        />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ width: 160 }}
          value={nick}
          maxLength={24}
          onChange={(e) => setNick(e.target.value)}
          placeholder="昵称（可选）"
        />
        <button className="btn" onClick={submit} disabled={busy || body.trim().length < 2}>
          {busy ? '发送中…' : '回复'}
        </button>
      </div>
      {error ? (
        <div className="alert bad" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
