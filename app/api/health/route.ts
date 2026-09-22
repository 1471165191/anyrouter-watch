import { NextResponse } from 'next/server';
import dns from 'node:dns/promises';
import net from 'node:net';
import { dbEnabled, query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 运维诊断端点。需要 x-ingest-secret，避免把连接信息暴露给外人。
 *
 * 为什么需要它：
 *   /api/status 在数据库连不上和数据库为空这两种情况下，都返回 source=demo。
 *   对用户来说表现一样（都显示示例数据），但对我们来说是完全不同的问题。
 *   所以把「连不上」的原因单独暴露出来，一步定位。
 *
 * 安全约定：只回显主机名和端口，密码一律打码；错误信息里若含连接串也做替换。
 */
function maskConnectionString(s: string): string {
  return s.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@');
}

function sanitize(msg: string): string {
  return msg.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, (m) => maskConnectionString(m));
}

export async function GET(req: Request) {
  const secret = req.headers.get('x-ingest-secret') ?? new URL(req.url).searchParams.get('secret');
  if (!process.env.INGEST_SECRET || secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const out: Record<string, unknown> = {
    dbEnabled: dbEnabled(),
    hasIngestSecret: Boolean(process.env.INGEST_SECRET),
    node: process.version,
  };

  const url = process.env.DATABASE_URL;
  if (!url) {
    out.verdict = 'DATABASE_URL 没有注入到运行时';
    return NextResponse.json(out);
  }

  let host = '';
  let port = 5432;
  let user = '';
  try {
    const u = new URL(url);
    host = u.hostname;
    port = Number(u.port || 5432);
    user = u.username;
    out.target = { host, port, user, database: u.pathname.replace(/^\//, '') };
  } catch {
    out.verdict = 'DATABASE_URL 格式不对';
    return NextResponse.json(out);
  }

  // 1) DNS
  try {
    const addrs = await dns.lookup(host, { all: true });
    out.dns = addrs.map((a) => `${a.address} (v${a.family})`);
  } catch (e) {
    out.dns = null;
    out.dnsError = e instanceof Error ? e.message : String(e);
    out.verdict = 'DNS 解析失败';
    return NextResponse.json(out);
  }

  // 2) TCP
  const tcp = await new Promise<{ ok: boolean; ms: number; err?: string }>((resolve) => {
    const t0 = Date.now();
    const sock = net.connect({ host, port });
    const done = (ok: boolean, err?: string) => {
      sock.destroy();
      resolve({ ok, ms: Date.now() - t0, err });
    };
    sock.setTimeout(8000);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false, 'TCP 连接超时'));
    sock.once('error', (e) => done(false, e.message));
  });
  out.tcp = tcp;
  if (!tcp.ok) {
    out.verdict = 'TCP 连不上，多半是网络/防火墙问题';
    return NextResponse.json(out);
  }

  // 3) 真正跑一条查询
  try {
    const rows = await query<{ n: number }>('select 1 as n');
    out.query = { ok: true, value: rows[0]?.n };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    out.query = { ok: false, error: sanitize(raw) };
    const code = (e as { code?: string })?.code;
    if (code) out.pgCode = code;
    out.verdict = 'TCP 通了但查询失败 —— 看 error 里的具体原因';
    return NextResponse.json(out);
  }

  // 4) 顺带看一眼表在不在
  try {
    const rows = await query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' order by table_name`,
    );
    out.tables = rows.map((r) => r.table_name);
  } catch (e) {
    out.tables = null;
    out.tablesError = sanitize(e instanceof Error ? e.message : String(e));
  }

  out.verdict = '数据库连接正常';
  return NextResponse.json(out);
}
