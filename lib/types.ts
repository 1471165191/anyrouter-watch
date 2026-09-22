export type Verdict = 'ok' | 'slow' | 'down';

export type HealthLevel = 'ok' | 'degraded' | 'down';

/** 一次探测的结果 */
export interface Probe {
  ts: number;
  ok: boolean;
  status: number;
  latencyMs: number;
  errorCode: string | null;
}

/** 接入线路 */
export interface RouteDef {
  id: string;
  name: string;
  baseUrl: string;
  needsProxy: boolean;
  note: string;
}

/** 分组（对应站内不同模型池） */
export interface GroupDef {
  id: string;
  name: string;
  desc: string;
  /**
   * 这个分组要打哪个端点。
   *
   * 踩过的坑：AnyRouter 不同模型族走的接口格式不一样，模型名对了但端点不对，
   * 一样会返回 `404 当前 API 不支持所选模型` —— 看起来像模型不存在，其实是打错了接口。
   *   chat      → POST /v1/chat/completions（OpenAI 经典格式）
   *   messages  → POST /v1/messages（Anthropic 格式，Claude 系必须走这个）
   *   responses → POST /v1/responses（OpenAI 新格式，gpt-6-astra 这类只认这个）
   */
  api: 'chat' | 'messages' | 'responses';
  /** 候选探测模型，按顺序取第一个；列在这里的都必须是该账号真实可用的 */
  models: string[];
}

/** 故障事件（由连续失败探测聚合而来） */
export interface Incident {
  id: string;
  routeId: string;
  routeName: string;
  groupId: string;
  groupName: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number;
  peakStatus: number;
  summary: string;
}

/** 用户众包上报 */
export interface UserReport {
  id: string;
  ts: number;
  verdict: Verdict;
  routeId: string | null;
  routeName: string | null;
  groupId: string | null;
  groupName: string | null;
  model: string | null;
  client: string | null;
  network: string | null;
  message: string | null;
}

/** 单个「线路 × 分组」的统计 */
export interface TargetStats {
  routeId: string;
  groupId: string;
  /** 窗口内是否有真实探测数据。false 时页面显示「—」，不要假装 100% */
  hasData: boolean;
  probes: Probe[];
  uptime24h: number;
  uptime1h: number;
  avgLatency: number;
  p95Latency: number;
  current: HealthLevel;
  lastProbeAt: number;
}

/** 单条线路的综合统计 */
export interface RouteStats {
  route: RouteDef;
  /**
   * 24 小时内所有分组全军覆没 —— 大概率不是「临时故障」而是这个地址已经失效了。
   * 两者要分开显示：故障是等一等就好，失效是得去换地址。
   */
  likelyDead: boolean;
  probes: Probe[];
  uptime24h: number;
  uptime1h: number;
  avgLatency: number;
  p95Latency: number;
  current: HealthLevel;
  lastProbeAt: number;
  targets: TargetStats[];
  errorBreakdown: { code: string; label: string; count: number }[];
  incidents: Incident[];
}

/** 按时段聚合的可用率，用于热力图 */
export interface HourBucket {
  hour: number;
  uptime: number;
  samples: number;
}

/** 讨论区帖子。route/group 允许为空 —— 很多问题是通用的，不一定要挂在线路上。 */
export interface Thread {
  id: string;
  ts: number;
  updatedAt: number;
  title: string;
  body: string;
  nick: string | null;
  routeId: string | null;
  routeName: string | null;
  groupId: string | null;
  groupName: string | null;
  replyCount: number;
}

/** 帖子下的回复 */
export interface Reply {
  id: string;
  threadId: string;
  ts: number;
  body: string;
  nick: string | null;
}
