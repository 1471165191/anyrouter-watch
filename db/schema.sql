-- AnyRouter 观察站 · 数据库结构
--
-- 在 Neon / Supabase / 本地 Postgres 里执行一次即可：
--   psql "$DATABASE_URL" -f db/schema.sql
-- 或者：node scripts/init-db.mjs
--
-- 数据量估算：4 条线路 × 4 个分组 × 每 5 分钟一次 ≈ 每天 4600 行。
-- 建议定期清理 30 天前的明细，见文末。

create table if not exists probes (
  id          bigserial primary key,
  route_id    text        not null,
  group_id    text        not null,
  ts          timestamptz not null default now(),
  ok          boolean     not null,
  status      int         not null default 0,
  latency_ms  int         not null default 0,
  error_code  text,
  region      text
);

create index if not exists probes_target_ts_idx on probes (route_id, group_id, ts desc);
create index if not exists probes_ts_idx on probes (ts desc);

-- 故障事件：可由连续失败自动聚合，也允许人工补录说明
create table if not exists incidents (
  id          bigserial primary key,
  route_id    text        not null,
  group_id    text        not null,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  peak_status int,
  summary     text
);

create index if not exists incidents_started_idx on incidents (started_at desc);

-- 用户众包上报
create table if not exists reports (
  id          bigserial primary key,
  ts          timestamptz not null default now(),
  verdict     text        not null check (verdict in ('ok', 'slow', 'down')),
  route_id    text,
  route_name  text,
  group_id    text,
  group_name  text,
  model       text,
  client      text,
  network     text,
  message     text
);

create index if not exists reports_ts_idx on reports (ts desc);

-- 上报限频用（可选）。进程内限频在多实例部署下不可靠，正式上线建议启用这张表。
create table if not exists report_throttle (
  ip_hash     text        primary key,
  last_seen   timestamptz not null default now()
);

-- 讨论区。定位是「排障讨论」而不是通用论坛 ——
-- 帖子可以挂到具体线路/分组上，别人一进来就能看到「这条线路今天有没有人吐槽」。
create table if not exists threads (
  id          bigserial   primary key,
  ts          timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  title       text        not null,
  body        text        not null,
  nick        text,
  route_id    text,
  group_id    text,
  reply_count int         not null default 0
);

create index if not exists threads_updated_idx on threads (updated_at desc);
create index if not exists threads_route_idx on threads (route_id);

create table if not exists replies (
  id         bigserial   primary key,
  thread_id  bigint      not null references threads(id) on delete cascade,
  ts         timestamptz not null default now(),
  body       text        not null,
  nick       text
);

create index if not exists replies_thread_idx on replies (thread_id, ts);

-- 应用走 DATABASE_URL（postgres 用户），天然绕过 RLS；
-- 而 anon key 是公开的，不开 RLS 等于把表直接暴露给任何人。
-- 所以这里全部开启：宁可后面按需加 policy，也不要默认敞开。
alter table threads  enable row level security;
alter table replies  enable row level security;

-- 定期清理，建议用 cron 每天跑一次：
--   delete from probes where ts < now() - interval '30 days';
--   delete from report_throttle where last_seen < now() - interval '1 day';
