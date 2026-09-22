import { Pool } from 'pg';

/**
 * Postgres 连接池。
 *
 * 没配 DATABASE_URL 时，dbEnabled() 返回 false，上层会自动退回模拟数据 ——
 * 所以本地开发不需要数据库也能跑起来。
 *
 * serverless 环境下每次冷启动都会新建池，max 调小一点，别把连接数吃满。
 * Neon / Supabase 都要求 SSL，默认开启；本地 Postgres 可以设 DATABASE_SSL=disable。
 */

const g = globalThis as unknown as { __awPool?: Pool };

export function dbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function getPool(): Pool {
  if (!g.__awPool) {
    g.__awPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      ssl: process.env.DATABASE_SSL === 'disable' ? undefined : { rejectUnauthorized: false },
    });
    // 连接池里的错误不处理会直接让进程崩掉
    g.__awPool.on('error', (err) => {
      console.error('[db] pool error:', err.message);
    });
  }
  return g.__awPool;
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (!dbEnabled()) throw new Error('DATABASE_URL 未配置');
  const res = await getPool().query(sql, params);
  return res.rows as T[];
}

/**
 * 数据库出错时不要让整站 500 —— 状态页宁可展示旧数据或退回模拟数据，也不能白屏。
 * 所有取数都包一层这个。
 */
export async function safeQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[] | null> {
  if (!dbEnabled()) return null;
  try {
    return await query<T>(sql, params);
  } catch (e) {
    console.error('[db] query failed:', e instanceof Error ? e.message : e);
    return null;
  }
}
