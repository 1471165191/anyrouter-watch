import { NextResponse } from 'next/server';
import { dbEnabled } from '@/lib/db';
import { insertProbes, type ProbeInput } from '@/lib/probes';

export const dynamic = 'force-dynamic';

/**
 * 接收探测脚本回传的结果，写入 probes 表。
 *
 * 没配 DATABASE_URL 时只做校验和回显，方便本地试脚本。
 * 鉴权走 INGEST_SECRET 请求头 —— 这个接口会写库，别裸奔。
 */

const VALID_ROUTES = new Set(['main', 'cn-a', 'cn-b', 'cdn']);

function sanitize(raw: unknown): ProbeInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const routeId = typeof r.routeId === 'string' ? r.routeId : '';
  const groupId = typeof r.groupId === 'string' ? r.groupId : '';
  if (!routeId || !groupId) return null;

  const status = Number(r.status);
  const latencyMs = Number(r.latencyMs);

  return {
    routeId,
    groupId,
    ok: Boolean(r.ok),
    status: Number.isFinite(status) ? Math.trunc(status) : 0,
    latencyMs: Number.isFinite(latencyMs) ? Math.max(0, Math.trunc(latencyMs)) : 0,
    errorCode: typeof r.errorCode === 'string' ? r.errorCode.slice(0, 40) : null,
  };
}

export async function POST(req: Request) {
  const secret = process.env.INGEST_SECRET;
  if (secret && req.headers.get('x-ingest-secret') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { ts?: number; region?: string; results?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 });
  }

  const raw = Array.isArray(body.results) ? body.results : [];
  const results = raw.map(sanitize).filter((r): r is ProbeInput => r !== null);
  if (results.length === 0) {
    return NextResponse.json({ error: 'no valid results' }, { status: 400 });
  }

  const ts = Number.isFinite(body.ts) ? Number(body.ts) : Date.now();
  const region = typeof body.region === 'string' ? body.region.slice(0, 40) : null;

  if (!dbEnabled()) {
    return NextResponse.json({
      ok: true,
      received: results.length,
      stored: 0,
      note: 'DATABASE_URL 未配置，仅校验通过未落库。',
    });
  }

  try {
    const stored = await insertProbes(results, region, ts);
    return NextResponse.json({ ok: true, received: results.length, stored });
  } catch (e) {
    console.error('[ingest] insert failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'insert failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    db: dbEnabled(),
    knownRoutes: [...VALID_ROUTES],
    hint: 'POST { ts, region, results: [{ routeId, groupId, ok, status, latencyMs, errorCode }] }',
  });
}
