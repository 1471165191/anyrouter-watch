import type { GroupDef, RouteDef } from './types';

/**
 * 站点与线路配置。
 *
 * ⚠️ 2026-09-22：线路列表清空重来。
 *
 * 上一版抄了四条地址（主站直连 + 大陆优化 A/B + CDN 备用），上线后实测：
 *   main  https://anyrouter.top                      ✅ 可用
 *   cn-a  https://pmpjfbhq.cn-nb1.rainapp.top        ❌ 404 page not found
 *   cn-b  https://a-ocnfniawgw.cn-shanghai.fcapp.run ❌ 403 Current user is in debt
 *   cdn   https://q.quuvv.cn                         ❌ 连不上
 * 三条大陆线路全是错的，页面上却把它们当正经线路展示、还参与「推荐线路」评选，
 * 等于给用户指了三条死路。**不确定的地址宁可不写。**
 *
 * 所以现在只保留唯一验证过可用的主站直连。
 * 想加线路：往下面的数组里追加一项即可，探测脚本（scripts/probe.mjs）里
 * 有一份同名数组，两边必须保持一致，否则页面会显示没有数据的空线路。
 *
 * 加之前请务必自己先实测一次（curl 一下 /v1/models 就行），别再抄社区帖子。
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
];

/**
 * 分组配置。
 *
 * ⚠️ 2026-09-22 全部重写过一遍。之前那版是从社区帖子抄的模型名，
 * 实测**一个都不存在**（`gpt-4o` / `gpt-4o-mini` / `o3-mini` / `deepseek-v3` / `qwen-max`
 * 都不在 `/v1/models` 返回的列表里），导致探测全是 404，站点一直显示「线路大面积不可用」。
 *
 * 现在的依据是 `GET /v1/models` 的真实返回，并且按模型族选对了端点 —— 见 `GroupDef.api`。
 *
 * ⚠️ 光看 `/v1/models` 还不够。实测发现**列表里有 ≠ 真的能调**：
 *   · `gemini-2.5-flash`  不在列表里（只有 pro），以前当成可用模型探了两轮，全是 500
 *   · `gpt-5-codex`       在列表里，但两个端点都回 404「当前 API 不支持所选模型」
 *   · `claude-opus-4-6`   在列表里，但服务端明确说「已下线，请切换到 claude-opus-4-7」
 * 所以下面只放**实际打通过的**模型。改这里之前，请先用 scripts/probe.mjs --dry 实测。
 *
 * ⚠️ Claude 全系需要额外请求头 `anthropic-beta: context-1m-2025-08-07`。
 * 不带这个头，任何 Claude 模型都返回 `400 1m 上下文已经全量可用，请启用 1m 上下文后重试`
 * （2026-09-22 实测 3/3 稳定复现）。带上之后请求才真正打到上游。
 */
export const GROUPS: GroupDef[] = [
  {
    id: 'claude',
    name: 'Claude 系列',
    desc: 'Anthropic 全系，走 /v1/messages，需带 anthropic-beta 头',
    api: 'messages',
    models: [
      'claude-sonnet-4-5-20250929',
      'claude-opus-4-7',
      'claude-haiku-4-5-20251001',
      'claude-3-5-haiku-20241022',
    ],
  },
  {
    id: 'gpt',
    name: 'GPT 系列',
    desc: 'OpenAI 全系，走 /v1/responses',
    api: 'responses',
    models: ['gpt-6-astra'],
  },
  {
    id: 'gemini',
    name: 'Gemini 系列',
    desc: 'Google 全系，走 /v1/chat/completions',
    api: 'chat',
    models: ['gemini-2.5-pro'],
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
  context: '需要先启用 1m 上下文',
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
