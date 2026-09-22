#!/usr/bin/env node
/**
 * 建表脚本。
 *
 *   DATABASE_URL="postgres://..." node scripts/init-db.mjs
 *   或 npm run db:init
 *
 * 幂等，可以重复执行。
 */

import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('缺少 DATABASE_URL 环境变量');
  console.error('例如：DATABASE_URL="postgres://user:pass@host/db" node scripts/init-db.mjs');
  process.exit(1);
}

const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');

const client = new pg.Client({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === 'disable' ? undefined : { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);

  const { rows } = await client.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_name in ('probes','incidents','reports','report_throttle')
      order by table_name`,
  );
  console.log('建表完成，当前存在的表：');
  rows.forEach((r) => console.log(`  - ${r.table_name}`));
} catch (e) {
  console.error('建表失败：', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
