import { NextResponse } from 'next/server';
import { createThread, loadThreads } from '@/lib/discuss';
import { StoreUnavailableError, throttleRemaining } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** 发帖间隔，防刷屏。回复的间隔在 [id] 路由里另算。 */
const COOLDOWN_MS = 60 * 1000;

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip')) ?? 'unknown';
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const route = url.searchParams.get('route');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 30) || 30, 100);
  const { threads, source } = await loadThreads(limit, route);
  return NextResponse.json({ threads, source });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';

  if (title.length < 4) {
    return NextResponse.json({ error: '标题太短了，写清楚点别人才能帮上忙' }, { status: 400 });
  }
  if (title.length > 120) {
    return NextResponse.json({ error: '标题太长了，控制在 120 字以内' }, { status: 400 });
  }
  if (text.length < 6) {
    return NextResponse.json({ error: '正文太短了，至少说清楚现象' }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: '正文太长了，控制在 4000 字以内' }, { status: 400 });
  }

  // 发帖和上报共用一张限频表，但用不同的命名空间，
  // 免得「报了一条状态」就把「发帖」的额度也用掉了。
  const wait = await throttleRemaining(`${clientIp(req)}:discuss`, COOLDOWN_MS);
  if (wait > 0) {
    return NextResponse.json({ error: `发得太快了，${wait} 秒后再来` }, { status: 429 });
  }

  try {
    const thread = await createThread({
      title,
      body: text,
      nick: (body.nick as string) || null,
      routeId: (body.routeId as string) || null,
      groupId: (body.groupId as string) || null,
    });
    return NextResponse.json({ ok: true, thread });
  } catch (e) {
    if (e instanceof StoreUnavailableError) {
      return NextResponse.json({ error: '存储暂时不可用，帖子没能发出去，稍后再试' }, { status: 503 });
    }
    console.error('[threads] unexpected:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: '发帖失败，稍后再试' }, { status: 500 });
  }
}
