import { NextResponse } from 'next/server';
import { addReport, loadReports, summarize, throttleRemaining, StoreUnavailableError } from '@/lib/store';
import type { Verdict } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VALID: Verdict[] = ['ok', 'slow', 'down'];
const COOLDOWN_MS = 20 * 1000;

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip')) ?? 'unknown';
}

export async function GET() {
  const { reports, source } = await loadReports(50);
  return NextResponse.json({ reports, source, summary: summarize(reports) });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }

  const verdict = body.verdict as Verdict;
  if (!VALID.includes(verdict)) {
    return NextResponse.json({ error: '缺少有效的状态选择' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length > 300) {
    return NextResponse.json({ error: '补充说明太长了' }, { status: 400 });
  }

  const wait = await throttleRemaining(clientIp(req), COOLDOWN_MS);
  if (wait > 0) {
    return NextResponse.json({ error: `报得太快了，${wait} 秒后再来` }, { status: 429 });
  }

  try {
    const report = await addReport({
      verdict,
      routeId: (body.routeId as string) || null,
      routeName: (body.routeName as string) || null,
      groupId: (body.groupId as string) || null,
      groupName: (body.groupName as string) || null,
      model: (body.model as string) || null,
      client: (body.client as string) || null,
      network: (body.network as string) || null,
      message: message || null,
    });
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    if (e instanceof StoreUnavailableError) {
      return NextResponse.json(
        { error: '存储暂时不可用，你的反馈没能保存，稍后再试一次' },
        { status: 503 },
      );
    }
    console.error('[reports] unexpected:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: '提交失败，稍后再试' }, { status: 500 });
  }
}
