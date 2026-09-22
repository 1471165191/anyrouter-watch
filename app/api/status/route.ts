import { NextResponse } from 'next/server';
import { SITE } from '@/lib/config';
import { getSiteStats } from '@/lib/stats';

export const dynamic = 'force-dynamic';

/**
 * 开放数据接口。让别人也能把状态接进自己的脚本或机器人 —— 这是自然外链的来源之一。
 */
export async function GET() {
  const { routes, heatmap, level, uptime24h, source, dbOk, lastProbeAt } = await getSiteStats();

  return NextResponse.json(
    {
      site: SITE.id,
      siteName: SITE.name,
      generatedAt: Date.now(),
      lastProbeAt,
      level,
      uptime24h: Number(uptime24h.toFixed(4)),
      // demo 表示返回的是示例数据，请勿当真。dbOk 进一步说明原因：
      //   true  = 库是通的，只是还没有探测记录
      //   false = 连不上库
      source,
      dbOk,
      routes: routes.map((r) => ({
        id: r.route.id,
        name: r.route.name,
        baseUrl: r.route.baseUrl,
        needsProxy: r.route.needsProxy,
        level: r.current,
        uptime24h: Number(r.uptime24h.toFixed(4)),
        uptime1h: Number(r.uptime1h.toFixed(4)),
        avgLatencyMs: r.avgLatency,
        p95LatencyMs: r.p95Latency,
        groups: r.targets.map((t) => ({
          id: t.groupId,
          hasData: t.hasData,
          level: t.current,
          uptime24h: Number(t.uptime24h.toFixed(4)),
          avgLatencyMs: t.avgLatency,
        })),
      })),
      hourly: heatmap,
      note:
        source === 'db'
          ? '非官方第三方观测数据，仅供参考'
          : dbOk
            ? '数据库里还没有探测记录，返回的是示例数据'
            : '数据库连不上，返回的是示例数据',
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=240',
      },
    },
  );
}
