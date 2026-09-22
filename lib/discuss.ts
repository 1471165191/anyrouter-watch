import { GROUPS, ROUTES } from './config';
import { dbEnabled, query, safeQuery } from './db';
import { StoreUnavailableError } from './store';
import type { Reply, Thread } from './types';

/**
 * 讨论区存储。
 *
 * 定位是「排障讨论」而不是通用论坛：官方既没有状态页也没有社区，
 * 用户遇到问题只能自己猜。所以这里的帖子可以挂到具体线路/分组上，
 * 让人一进来就看到「这条线路今天有没有人吐槽过同样的事」。
 *
 * 和 store.ts 一样的规矩：配了库走库，没配库退回示例数据；
 * 但**写操作失败必须报错**，不能让用户以为发出去了其实没存。
 */

const g = globalThis as unknown as {
  __awThreads?: Thread[];
  __awReplies?: Map<string, Reply[]>;
};

// ---------------------------------------------------------------- 行映射

interface ThreadRow {
  id: string | number;
  ts: Date | string;
  updated_at: Date | string;
  title: string;
  body: string;
  nick: string | null;
  route_id: string | null;
  group_id: string | null;
  reply_count: string | number;
}

interface ReplyRow {
  id: string | number;
  thread_id: string | number;
  ts: Date | string;
  body: string;
  nick: string | null;
}

/**
 * 线路名/分组名不入库，读的时候从 config 反查。
 * 这样以后改了线路名，历史帖子跟着一起变，不会留下一堆过期的旧名字。
 */
function toThread(r: ThreadRow): Thread {
  return {
    id: String(r.id),
    ts: new Date(r.ts).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
    title: r.title,
    body: r.body,
    nick: r.nick,
    routeId: r.route_id,
    routeName: ROUTES.find((x) => x.id === r.route_id)?.name ?? null,
    groupId: r.group_id,
    groupName: GROUPS.find((x) => x.id === r.group_id)?.name ?? null,
    replyCount: Number(r.reply_count),
  };
}

function toReply(r: ReplyRow): Reply {
  return {
    id: String(r.id),
    threadId: String(r.thread_id),
    ts: new Date(r.ts).getTime(),
    body: r.body,
    nick: r.nick,
  };
}

const THREAD_COLUMNS = `id, ts, updated_at, title, body, nick, route_id, group_id, reply_count`;

// ---------------------------------------------------------------- 示例数据

/** 这些示例帖来自社区里反复出现的几类问题，不是随便编的 */
const DEMO_THREADS: { title: string; body: string; nick: string; routeId: string | null; groupId: string | null }[] = [
  {
    title: '下午三点后 Claude 分组基本全挂，是不是只有我这样',
    body:
      '从下午开始，claude 分组一直 502，换了三个客户端都一样。\n' +
      'GPT 分组倒是正常。看报错像是上游压力太大，不是我的配置问题吧？',
    nick: '老王',
    routeId: 'main',
    groupId: 'claude',
  },
  {
    title: '踩坑记录：Cherry Studio 报 401，最后发现是 key 前面多了个空格',
    body:
      '复制 key 的时候手滑带了个空格，排查了半小时。\n' +
      '排查方法：把 key 单独复制出来，前后各加一对引号，看有没有多余空白。\n' +
      '另外 base_url 到底要不要带 /v1 也折腾了很久，最后发现两种都能用。',
    nick: '阿杰',
    routeId: null,
    groupId: null,
  },
  {
    title: '主站直连下午一直超时，是站点的问题还是我的代理？',
    body:
      '同一个代理，早上还一切正常，下午开始全是超时。\n' +
      '换了两个节点都一样，但网页能打开官网。是上游在抽风吗？',
    nick: '路过的',
    routeId: 'main',
    groupId: null,
  },
  {
    title: '提醒一下：代理规则一定要覆盖 api 域名，只开代理没用',
    body:
      '我之前只开了代理、规则用的是「大陆白名单」，结果 anyrouter 的域名根本没走代理，\n' +
      '一直报连接被重置，查了半天才发现是规则的事。\n' +
      '改成全局或者手动把域名加进规则，立刻就通了。',
    nick: '老李',
    routeId: 'main',
    groupId: null,
  },
];

const DEMO_REPLIES: string[][] = [
  [
    '我这边也是，claude 分组从两点多开始就不行了，报「上游负载压力太大」。',
    '同挂，换个时段会好一些，晚上十一点之后明显流畅。',
    '刚试了一下能用了，可能刚才是抽风，你再等等。',
  ],
  ['学到了，我也是复制的时候带空格，找了半天。', 'base_url 带不带 /v1 确实是个坑，建议专门写一篇。'],
  ['大概率是上游负载，下午到深夜最挤。等一等或者缩短上下文再试。'],
  ['对，这个我踩过。只开代理不等于走了代理，规则没命中照样直连。'],
];

function seedThreads(): Thread[] {
  const now = Date.now();
  return DEMO_THREADS.map((t, i) => {
    const ts = now - (i + 1) * 47 * 60 * 1000;
    const route = ROUTES.find((r) => r.id === t.routeId);
    const group = GROUPS.find((x) => x.id === t.groupId);
    return {
      id: `demo-t${i}`,
      ts,
      updatedAt: ts + (DEMO_REPLIES[i]?.length ?? 0) * 9 * 60 * 1000,
      title: t.title,
      body: t.body,
      nick: t.nick,
      routeId: t.routeId,
      routeName: route?.name ?? null,
      groupId: t.groupId,
      groupName: group?.name ?? null,
      replyCount: DEMO_REPLIES[i]?.length ?? 0,
    };
  });
}

function memoryThreads(): Thread[] {
  if (!g.__awThreads) g.__awThreads = seedThreads();
  return g.__awThreads;
}

function memoryReplies(threadId: string): Reply[] {
  if (!g.__awReplies) g.__awReplies = new Map();
  if (!g.__awReplies.has(threadId)) {
    const idx = Number(threadId.replace('demo-t', ''));
    const bodies = DEMO_REPLIES[idx] ?? [];
    const base = memoryThreads().find((t) => t.id === threadId)?.ts ?? Date.now();
    g.__awReplies.set(
      threadId,
      bodies.map((body, i) => ({
        id: `${threadId}-r${i}`,
        threadId,
        ts: base + (i + 1) * 9 * 60 * 1000,
        body,
        nick: ['楼下', '路过的', '老王'][i % 3],
      })),
    );
  }
  return g.__awReplies.get(threadId)!;
}

// ---------------------------------------------------------------- 读

export interface ThreadLoad {
  threads: Thread[];
  source: 'db' | 'demo';
}

export async function loadThreads(limit = 30, routeId?: string | null): Promise<ThreadLoad> {
  const rows = routeId
    ? await safeQuery<ThreadRow>(
        `select ${THREAD_COLUMNS} from threads where route_id = $1 order by updated_at desc limit $2`,
        [routeId, limit],
      )
    : await safeQuery<ThreadRow>(
        `select ${THREAD_COLUMNS} from threads order by updated_at desc limit $1`,
        [limit],
      );

  if (rows && rows.length > 0) return { threads: rows.map(toThread), source: 'db' };

  const demo = memoryThreads();
  const filtered = routeId ? demo.filter((t) => t.routeId === routeId) : demo;
  return { threads: filtered.slice(0, limit), source: 'demo' };
}

export interface ThreadDetail {
  thread: Thread | null;
  replies: Reply[];
  source: 'db' | 'demo';
}

export async function loadThread(id: string): Promise<ThreadDetail> {
  // 示例数据的 id 不是数字，直接跳过数据库查询
  if (/^\d+$/.test(id)) {
    const tRows = await safeQuery<ThreadRow>(`select ${THREAD_COLUMNS} from threads where id = $1`, [id]);
    if (tRows && tRows.length > 0) {
      const rRows = await safeQuery<ReplyRow>(
        `select id, thread_id, ts, body, nick from replies where thread_id = $1 order by ts asc limit 500`,
        [id],
      );
      return {
        thread: toThread(tRows[0]),
        replies: (rRows ?? []).map(toReply),
        source: 'db',
      };
    }
  }

  const demo = memoryThreads().find((t) => t.id === id) ?? null;
  return { thread: demo, replies: demo ? memoryReplies(id) : [], source: 'demo' };
}

/** 首页/上报页用：拿最近几条讨论，让人知道这儿有人在说话 */
export async function loadRecentThreads(limit = 4): Promise<ThreadLoad> {
  return loadThreads(limit);
}

// ---------------------------------------------------------------- 写

export interface ThreadInput {
  title: string;
  body: string;
  nick?: string | null;
  routeId?: string | null;
  groupId?: string | null;
}

export async function createThread(input: ThreadInput): Promise<Thread> {
  // 标题不做长度校验（见 /api/threads 的说明）。这里只留一个纯排版用的
  // 上限：再长列表就没法看了。300 字对标题来说等于不设限。
  const title = input.title.trim().slice(0, 300);
  const body = input.body.trim().slice(0, 4000);
  const nick = input.nick?.trim().slice(0, 24) || null;

  if (dbEnabled()) {
    try {
      const rows = await query<ThreadRow>(
        `insert into threads (title, body, nick, route_id, group_id)
         values ($1,$2,$3,$4,$5)
         returning ${THREAD_COLUMNS}`,
        [title, body, nick, input.routeId ?? null, input.groupId ?? null],
      );
      return toThread(rows[0]);
    } catch (e) {
      console.error('[discuss] insert thread failed:', e instanceof Error ? e.message : e);
      throw new StoreUnavailableError();
    }
  }

  const thread: Thread = {
    id: `u-t${Date.now()}`,
    ts: Date.now(),
    updatedAt: Date.now(),
    title,
    body,
    nick,
    routeId: input.routeId ?? null,
    routeName: ROUTES.find((r) => r.id === input.routeId)?.name ?? null,
    groupId: input.groupId ?? null,
    groupName: GROUPS.find((x) => x.id === input.groupId)?.name ?? null,
    replyCount: 0,
  };
  memoryThreads().unshift(thread);
  return thread;
}

export interface ReplyInput {
  body: string;
  nick?: string | null;
}

export async function addReply(threadId: string, input: ReplyInput): Promise<Reply> {
  const body = input.body.trim().slice(0, 2000);
  const nick = input.nick?.trim().slice(0, 24) || null;

  if (dbEnabled() && /^\d+$/.test(threadId)) {
    try {
      // 插回复和更新帖子的回复数/活跃时间必须一起做，
      // 否则会出现「回复数对不上」或者帖子沉在列表底部。
      const rows = await query<ReplyRow>(
        `with ins as (
           insert into replies (thread_id, body, nick)
           values ($1,$2,$3)
           returning id, thread_id, ts, body, nick
         ), bump as (
           update threads
              set reply_count = reply_count + 1, updated_at = now()
            where id = $1
         )
         select * from ins`,
        [threadId, body, nick],
      );
      if (rows.length === 0) throw new Error('thread not found');
      return toReply(rows[0]);
    } catch (e) {
      console.error('[discuss] insert reply failed:', e instanceof Error ? e.message : e);
      throw new StoreUnavailableError();
    }
  }

  const reply: Reply = {
    id: `u-r${Date.now()}`,
    threadId,
    ts: Date.now(),
    body,
    nick,
  };
  memoryReplies(threadId).push(reply);
  const t = memoryThreads().find((x) => x.id === threadId);
  if (t) {
    t.replyCount += 1;
    t.updatedAt = reply.ts;
  }
  return reply;
}

/** 讨论区也限频，复用 store 里那套 IP 哈希方案（这里传带命名空间的 ip） */
export const DISCUSS_NAMESPACE = ':discuss';
