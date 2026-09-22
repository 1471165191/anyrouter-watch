import type { GroupDef, RouteDef } from './types';

/**
 * 站点与线路配置。
 *
 * 这里的所有地址都来自公开渠道（社区帖子、博客），线路随时可能变化或失效。
 * 上线前请自己核实一遍，并且把探测频率控制在合理范围，别给人家添负担。
 */

export const SITE = {
  id: 'anyrouter',
  name: 'AnyRouter',
  title: 'AnyRouter 观察站',
  tagline: '中转站可用性观测与配置排障',
};

export const ROUTES: RouteDef[] = [
  {
    id: 'main',
    name: '主站直连',
    baseUrl: 'https://anyrouter.top',
    needsProxy: true,
    note: '必须科学上网才能访问，国内直连会超时',
  },
  {
    id: 'cn-a',
    name: '大陆优化 A',
    baseUrl: 'https://pmpjfbhq.cn-nb1.rainapp.top',
    needsProxy: false,
    note: '国内可直连，无需代理',
  },
  {
    id: 'cn-b',
    name: '大陆优化 B',
    baseUrl: 'https://a-ocnfniawgw.cn-shanghai.fcapp.run',
    needsProxy: false,
    note: '国内可直连，无需代理',
  },
  {
    id: 'cdn',
    name: 'CDN 备用',
    baseUrl: 'https://q.quuvv.cn',
    needsProxy: false,
    note: '社区流传的备用线路，稳定性未知',
  },
];

/**
 * 分组配置。
 *
 * ⚠️ 2026-09-22 全部重写过一遍。之前那版是从社区帖子抄的模型名，
 * 实测**一个都不存在**（`gpt-4o` / `gpt-4o-mini` / `o3-mini` / `deepseek-v3` / `qwen-max`
 * 都不在 `/v1/models` 返回的列表里），导致探测全是 404，站点一直显示「线路大面积不可用」。
 *
 * 现在的依据是 `GET /v1/models` 的真实返回（该账号下 15 个模型），
 * 并且按模型族选对了端点 —— 见 `GroupDef.api` 的注释。
 *
 * 另外：**该账号下没有任何国产模型**（DeepSeek / Qwen / GLM 等一个都没有），
 * 所以原来的 `domestic` 分组已删除。如果以后站点上了国产模型，照着下面的格式加回来即可。
 */
export const GROUPS: GroupDef[] = [
  {
    id: 'claude',
    name: 'Claude 系列',
    desc: 'Anthropic 全系，走 /v1/messages',
    api: 'messages',
    models: [
      'claude-3-5-haiku-20241022',
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-5-20250929',
      'claude-opus-4-5-20251101',
    ],
  },
  {
    id: 'gpt',
    name: 'GPT 系列',
    desc: 'OpenAI 全系，走 /v1/responses',
    api: 'responses',
    models: ['gpt-6-astra', 'gpt-5-codex'],
  },
  {
    id: 'gemini',
    name: 'Gemini 系列',
    desc: 'Google 全系，走 /v1/chat/completions',
    api: 'chat',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  },
];

/** 探测节奏与统计窗口 */
export const STEP_MS = 5 * 60 * 1000;
export const WINDOW_HOURS = 24;
export const POINTS = (WINDOW_HOURS * 60) / 5;

/** 把当前时间对齐到 5 分钟刻度，保证同一次请求内数据稳定 */
export function alignedNow(): number {
  return Math.floor(Date.now() / STEP_MS) * STEP_MS;
}

export const ERROR_LABELS: Record<string, string> = {
  overload: '上游负载压力太大',
  bad_gateway: '502 网关错误',
  rate_limit: '429 触发限流',
  timeout: '504 上游超时',
  auth: '401 鉴权失败',
  debt: '该线路的账号欠费了',
  not_found: '404 路径或模型不存在',
  network: '连不上服务器',
};

export const NETWORKS = ['电信', '联通', '移动', '教育网', '海外'] as const;

export const CLIENTS = [
  'Cherry Studio',
  'NextChat',
  'LobeChat',
  'Cline',
  'Cursor',
  'Dify',
  '沉浸式翻译',
  'Python SDK',
  'Node SDK',
  '其他',
] as const;

export const VERDICT_LABEL = {
  ok: '正常能用',
  slow: '很慢但能用',
  down: '完全用不了',
} as const;

export function routeById(id: string): RouteDef | undefined {
  return ROUTES.find((r) => r.id === id);
}

export function groupById(id: string): GroupDef | undefined {
  return GROUPS.find((g) => g.id === id);
}
