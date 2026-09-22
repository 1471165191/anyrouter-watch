import { alignedNow, POINTS, STEP_MS } from './config';
import type { Probe } from './types';

/**
 * 示例探测数据（确定性生成）。
 *
 * 只在数据库为空时使用，让站点在数据攒够之前不至于是一片空白。
 * 页面上会明确标注「当前为示例数据」，不会让人误以为是真的。
 *
 * 生成逻辑刻意模拟了两个社区反馈的真实规律：
 *   1. 不同分组的稳定性不同（Claude 最挤）
 *   2. 白天负载高、凌晨负载低 —— 「凌晨三点很流畅」
 */

const ROUTE_BIAS: Record<string, number> = {
  main: 0.02,
};

const GROUP_BIAS: Record<string, number> = {
  claude: 0.05,
  gpt: 0,
  gemini: 0.02,
};

function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function seedOf(key: string): number {
  let s = 7;
  for (let i = 0; i < key.length; i += 1) s = (s * 31 + key.charCodeAt(i)) % 100003;
  return s;
}

/** 负载曲线：凌晨 4 点最低，下午 4 点最高 */
function loadFactor(hour: number): number {
  const t = ((hour - 4 + 24) % 24) / 24;
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
}

function makeProbe(seed: number, ts: number, failBase: number): Probe {
  const slot = Math.floor(ts / STEP_MS);
  const load = loadFactor(new Date(ts).getHours());
  const burst = hash(seed * 104729 + Math.floor(slot / 6));
  const inBurst = burst > 0.955;

  let failRate = failBase + 0.1 * load;
  if (inBurst) failRate += 0.42;

  if (hash(seed * 7919 + slot) < failRate) {
    const kind = hash(seed * 24593 + slot);
    let status = 503;
    let errorCode = 'overload';
    if (kind > 0.62 && kind <= 0.82) {
      status = 502;
      errorCode = 'bad_gateway';
    } else if (kind > 0.82 && kind <= 0.92) {
      status = 429;
      errorCode = 'rate_limit';
    } else if (kind > 0.92) {
      status = 504;
      errorCode = 'timeout';
    }
    return { ts, ok: false, status, latencyMs: 0, errorCode };
  }

  const slow = hash(seed * 31337 + slot) > 0.93;
  const latencyMs = slow
    ? 3800 + Math.round(hash(seed + slot * 7) * 7200)
    : 480 + Math.round(hash(seed * 3 + slot) * 1200);

  return { ts, ok: true, status: 200, latencyMs, errorCode: null };
}

export function demoProbesForTarget(routeId: string, groupId: string, count = POINTS): Probe[] {
  const seed = seedOf(`${routeId}:${groupId}`);
  const failBase = (ROUTE_BIAS[routeId] ?? 0.03) + (GROUP_BIAS[groupId] ?? 0);
  const now = alignedNow();
  const out: Probe[] = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(makeProbe(seed, now - i * STEP_MS, failBase));
  return out;
}
