import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import DataSourceNotice from '@/components/DataSourceNotice';
import ReplyForm from '@/components/ReplyForm';
import { fmtAgo, fmtDateTime } from '@/components/viz';
import { loadThread } from '@/lib/discuss';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { thread } = await loadThread(id);
  if (!thread) return { title: '帖子不存在' };
  return {
    title: thread.title,
    description: thread.body.slice(0, 120),
  };
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { thread, replies, source } = await loadThread(id);
  if (!thread) notFound();

  return (
    <div>
      <DataSourceNotice source={source} />

      <div style={{ marginBottom: 18 }}>
        <Link href="/discuss" className="faint" style={{ fontSize: 13 }}>
          ← 回讨论区
        </Link>
      </div>

      <div className="card">
        <h1 style={{ marginBottom: 10 }}>{thread.title}</h1>
        <div className="report-meta" style={{ marginBottom: 14 }}>
          <span>{thread.nick ?? '匿名'}</span>
          <span>·</span>
          <span>{fmtDateTime(thread.ts)}</span>
          {thread.routeName ? <span className="tag">{thread.routeName}</span> : null}
          {thread.groupName ? <span className="tag">{thread.groupName}</span> : null}
        </div>
        <div className="thread-body">{thread.body}</div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>{thread.replyCount} 条回复</h2>
          {thread.replyCount !== replies.length ? (
            <span className="hint">只显示最近 {replies.length} 条</span>
          ) : null}
        </div>

        <div className="card">
          {replies.length === 0 ? (
            <div className="faint">还没有人回复。如果你也遇到同样的问题，说一声「我也是」就很有价值。</div>
          ) : (
            replies.map((r, i) => (
              <div key={r.id} className="reply-item">
                <div className="step-idx">{i + 1}</div>
                <div className="report-body">
                  <div className="thread-body" style={{ fontSize: 13.5 }}>
                    {r.body}
                  </div>
                  <div className="report-meta">
                    <span>{r.nick ?? '匿名'}</span>
                    <span>·</span>
                    <span>{fmtAgo(r.ts)}</span>
                    <span>·</span>
                    <span>{fmtDateTime(r.ts)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="section">
        <div className="card">
          <h3>接着说</h3>
          <ReplyForm threadId={thread.id} />
        </div>
      </div>
    </div>
  );
}
