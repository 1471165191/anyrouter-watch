import { NextResponse } from 'next/server';
import { addReply, loadThread } from '@/lib/discuss';
import { StoreUnavailableError, throttleRemaining } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** 回复间隔比发帖短一些，讨论起来才不别扭 */
const COOLDOWN_MS = 20 * 1000;

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip')) ?? 'unknown';
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { thread, replies, source } = await loadThread(id);
  if (!thread) return NextResponse.json({ error: '这个帖子不存在' }, { status: 404 });
  return NextResponse.json({ thread, replies, source });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }

  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (text.length < 2) {
    return NextResponse.json({ error: '回复太短了' }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: '回复太长了，控制在 2000 字以内' }, { status: 400 });
  }

  // 回复的限频按 IP 算，不按帖子算 —— 否则挨个帖子回一条就绕过去了
  const wait = await throttleRemaining(`${clientIp(req)}:reply`, COOLDOWN_MS);
  if (wait > 0) {
    return NextResponse.json({ error: `回得太快了，${wait} 秒后再来` }, { status: 429 });
  }

  try {
    const reply = await addReply(id, { body: text, nick: (body.nick as string) || null });
    return NextResponse.json({ ok: true, reply });
  } catch (e) {
    if (e instanceof StoreUnavailableError) {
      return NextResponse.json({ error: '存储暂时不可用，回复没能保存，稍后再试' }, { status: 503 });
    }
    console.error('[threads/:id] unexpected:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: '回复失败，稍后再试' }, { status: 500 });
  }
}
