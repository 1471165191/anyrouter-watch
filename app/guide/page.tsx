import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@/lib/config';

export const metadata: Metadata = {
  title: '排障手册',
  description:
    'AnyRouter 报错对照表与客户端配置填法：502 / 503 / 429 / 401 / 超时分别是谁的问题，以及 Cherry Studio、Cline、Cursor、NextChat、LobeChat、SDK 里 base_url 到底要不要带 /v1。',
};

/* ---------------------------------------------------------------- 错误码 */

interface Entry {
  code: string;
  raw: string;
  who: '你' | '线路' | '上游' | '不一定';
  meaning: string;
  causes: string[];
  fixes: string[];
}

const ENTRIES: Entry[] = [
  {
    code: '503',
    raw: '上游负载压力太大 / Upstream overloaded',
    who: '上游',
    meaning: '中转站的上游渠道被压满了，请求进不去。这是这个站最常见的报错。',
    causes: [
      '使用高峰（下午到深夜）',
      '上下文特别长，单次请求占用资源大',
      '某个分组（尤其是 Claude）被集中挤兑',
    ],
    fixes: [
      '缩短上下文，开新会话重新问',
      '换低峰时段用，凌晨通常明显好转',
      '降低并发，别同时开多个请求',
    ],
  },
  {
    code: '502',
    raw: 'Bad Gateway',
    who: '上游',
    meaning: '网关收到了无效响应，通常意味着后端进程崩了或者在重启。',
    causes: ['上游服务异常', '线路节点故障', '流量突增导致后端过载'],
    fixes: ['先看状态页确认是不是全线都在 502，是的话等一会儿', '注意：502 不代表一定没扣费，去后台核对用量'],
  },
  {
    code: '520',
    raw: 'Web server is returning an unknown error',
    who: '线路',
    meaning: 'Cloudflare 抛出的错误，表示回源失败 —— 多半是节点和源站之间断了。',
    causes: ['CDN 节点回源异常', '域名被解析到失效节点'],
    fixes: ['清理本地 DNS 缓存后重试', '换个代理节点再试'],
  },
  {
    code: '429',
    raw: 'Too Many Requests / Service Unavailable',
    who: '不一定',
    meaning:
      '看到 429 先看返回内容。写着 rate limit 才是你发太快；写着 Service Unavailable 是渠道被打满了，那是上游的事，跟你无关。',
    causes: [
      '短时间并发请求过多（rate limit）',
      '客户端有自动重试，越重试越糟（rate limit）',
      '该模型的渠道全部打满（Service Unavailable）',
    ],
    fixes: [
      'rate limit：把客户端的自动重试关掉或调大间隔，降低并发',
      'Service Unavailable：改什么都没用，换个时段再来',
      '两者都别急着换 key，429 跟 key 有效性无关',
    ],
  },
  {
    code: '401',
    raw: 'Unauthorized / Invalid API key',
    who: '你',
    meaning: 'key 无效或格式不对，服务端根本不认。',
    causes: ['key 复制不全', '首尾混入空格或换行', '用了别家站的 key', 'key 被重置过'],
    fixes: ['重新完整复制一遍 key', '删掉重新粘贴，别手动补字符', '去后台确认 key 还是有效的'],
  },
  {
    code: '403',
    raw: 'Forbidden / 额度不足 / Current user is in debt',
    who: '不一定',
    meaning: 'key 是有效的，但没有权限、额度用完了，或者账号欠费。',
    causes: ['当日额度耗尽', '分组权限不匹配（key 无权访问该分组）', '账号被限制或欠费'],
    fixes: ['去后台看余额和用量', '换一个自己有权限的分组', '确认 key 对应的分组设置'],
  },
  {
    code: '400',
    raw: '1m 上下文已经全量可用，请启用 1m 上下文后重试',
    who: '你',
    meaning:
      'Claude 模型专属的一道门槛。服务端要求请求显式声明使用 1M 上下文窗口，没声明就直接拒 —— 跟 key、余额、负载都无关，看到这句别去查余额。',
    causes: [
      '客户端没有带上 anthropic-beta 请求头',
      '客户端的模型设置里没有开启「1M 上下文」选项',
    ],
    fixes: [
      '在 Anthropic 请求头里加上 anthropic-beta: context-1m-2025-08-07',
      'Cherry Studio 这类客户端在模型设置里勾「1M 上下文」，会自动带上这个头',
      '用配置自检生成的 curl 对照一下，那条命令已经带了这个头',
    ],
  },
  {
    code: '404',
    raw: 'Not Found / 当前 API 不支持所选模型',
    who: '你',
    meaning:
      '路径、模型名、端点三者有一个不对。特别注意后两种：模型名对但端点错，报的也是这句话；模型明明在 /models 列表里、上游却没接，报的还是这句话。',
    causes: [
      'base_url 少了或多写了 /v1',
      '模型名拼错、大小写不对、漏了日期后缀',
      '端点选错：Claude 走 /v1/messages，GPT 走 /v1/responses，其余走 /v1/chat/completions',
      '模型在列表里但上游没接（实测 gpt-5-codex 就是这种，两个端点都 404）',
    ],
    fixes: [
      '对照下面的客户端说明检查 base_url',
      '从站内模型列表复制准确的模型名',
      '换个模型对比一下 —— 换一个就好，说明是那个模型本身没接',
      '用配置自检跑一遍，它会告诉你实际打的是哪个端点',
    ],
  },
  {
    code: '504',
    raw: 'Gateway Timeout / 请求超时',
    who: '上游',
    meaning: '服务端在限定时间内没返回结果。请求发出去了，但没人接。',
    causes: ['上游排队严重', '请求内容太长导致处理超时', '线路抖动'],
    fixes: ['缩短输入内容', '把客户端的超时时间调大一些', '换个时段重试'],
  },
  {
    code: 'ECONNRESET',
    raw: 'Connection reset / 连接被重置 / 无法连接',
    who: '线路',
    meaning: 'TCP 连接直接被掐断，通常是网络层的问题，压根没到服务端。',
    causes: ['主站直连但没开代理（国内会超时或被重置）', '代理规则没覆盖到这个域名', 'DNS 污染'],
    fixes: [
      '确认代理开着，而且规则命中了这个域名 —— 只开代理不等于走了代理',
      '把域名的 DNS 查询也交给代理',
      '换个代理节点再试',
    ],
  },
  {
    code: 'QUOTA',
    raw: "You've hit your usage limit. Try again later.",
    who: '你',
    meaning: '你的账号或 key 用满了限额。这条是明确的额度问题，不是故障。',
    causes: ['当日免费额度用完', '被其他程序大量调用', '多个客户端共用同一个 key'],
    fixes: ['等额度刷新（通常是次日）', '检查有没有程序在后台刷量', '换一个 key'],
  },
];

const WHO_STYLE: Record<Entry['who'], string> = {
  你: 'lv-degraded',
  线路: 'lv-down',
  上游: 'lv-down',
  不一定: 'neutral',
};

/* ------------------------------------------------------------ 客户端配置 */

interface ClientGuide {
  name: string;
  kind: string;
  baseUrlStyle: '带 /v1' | '不带 /v1';
  fields: { k: string; v: string }[];
  tips: string[];
  code?: string;
}

const GUIDES: ClientGuide[] = [
  {
    name: 'Cherry Studio',
    kind: '桌面客户端',
    baseUrlStyle: '带 /v1',
    fields: [
      { k: 'API 类型', v: 'OpenAI' },
      { k: 'API 地址', v: `${ROUTES[0].baseUrl}/v1` },
      { k: '模型', v: '点「获取模型列表」，然后从里面勾，别手打' },
    ],
    tips: [
      '填完一定要点一下「测试」，通过再用',
      '模型列表拉不出来，多半是地址结尾多了或少了一个 /v1',
      '用 Claude 模型时，在模型设置里勾上「1M 上下文」—— 不勾会拿到 400「请启用 1m 上下文」',
    ],
  },
  {
    name: 'Cline / Roo Code',
    kind: 'VSCode 插件',
    baseUrlStyle: '带 /v1',
    fields: [
      { k: 'API Provider', v: 'OpenAI Compatible' },
      { k: 'Base URL', v: `${ROUTES[0].baseUrl}/v1` },
      { k: 'Model ID', v: '从站内模型列表复制完整名字' },
    ],
    tips: ['这类插件请求量大，很容易撞 429，把并发和自动重试调保守', '同一个 key 不要同时给多个插件用'],
  },
  {
    name: 'Cursor',
    kind: 'IDE',
    baseUrlStyle: '带 /v1',
    fields: [
      { k: 'Override OpenAI Base URL', v: `${ROUTES[0].baseUrl}/v1` },
      { k: 'Model', v: '手动添加模型名' },
    ],
    tips: ['Cursor 高频发请求，很容易限流，建议只在小范围开启自定义模型', '验证按钮失败不代表不能用，先直接对话试一次'],
  },
  {
    name: 'NextChat / ChatGPT-Next-Web',
    kind: '网页 / 自部署',
    baseUrlStyle: '不带 /v1',
    fields: [
      { k: '接口地址', v: `${ROUTES[0].baseUrl}（结尾不要带 /v1）` },
      { k: '自定义模型名', v: '手动填写，逗号分隔' },
    ],
    tips: ['NextChat 会自己在结尾拼 /v1，你再带上就变成 /v1/v1，直接 404'],
  },
  {
    name: 'LobeChat',
    kind: '网页 / 自部署',
    baseUrlStyle: '带 /v1',
    fields: [
      { k: '接口代理地址', v: `${ROUTES[0].baseUrl}/v1` },
      { k: '模型', v: '从列表选择' },
    ],
    tips: ['打开「检查连通性」按钮验证', '有些版本需要在服务端配置里放 key，不是前端界面'],
  },
  {
    name: '沉浸式翻译',
    kind: '浏览器插件',
    baseUrlStyle: '带 /v1',
    fields: [
      { k: '翻译服务', v: 'OpenAI' },
      { k: '自定义 API 地址', v: `${ROUTES[0].baseUrl}/v1` },
      { k: '模型', v: '选便宜的型号，翻译量大会很快耗额度' },
    ],
    tips: ['并发调低一些，否则很容易触发限流', '翻译场景建议单独用一个 key，方便排查用量'],
  },
  {
    name: 'Python (openai SDK)',
    kind: '代码',
    baseUrlStyle: '带 /v1',
    fields: [
      { k: 'base_url', v: `${ROUTES[0].baseUrl}/v1` },
    ],
    tips: ['建议从环境变量读 key，别写死在代码里', '务必设置 timeout，中转站抖动时默认等待会卡很久'],
    code: `from openai import OpenAI
import os

client = OpenAI(
    base_url=os.environ["ANYROUTER_BASE_URL"],  # ${ROUTES[0].baseUrl}/v1
    api_key=os.environ["ANYROUTER_KEY"],
    timeout=60.0,
    max_retries=1,          # 中转站不稳，重试太多反而加重限流
)

resp = client.chat.completions.create(
    model="gemini-2.5-flash",   # 走 /v1/chat/completions 的模型
    messages=[{"role": "user", "content": "ping"}],
    max_tokens=16,
)`,
  },
  {
    name: 'Node.js (openai SDK)',
    kind: '代码',
    baseUrlStyle: '带 /v1',
    fields: [{ k: 'baseURL', v: `${ROUTES[0].baseUrl}/v1` }],
    tips: ['Node 18+ 自带 fetch，不需要额外配置'],
    code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: process.env.ANYROUTER_BASE_URL, // ${ROUTES[0].baseUrl}/v1
  apiKey: process.env.ANYROUTER_KEY,
  timeout: 60000,
  maxRetries: 1,
});

const resp = await client.chat.completions.create({
  model: "gemini-2.5-flash",
  messages: [{ role: "user", content: "ping" }],
  max_tokens: 16,
});`,
  },
];

/* ------------------------------------------------------------------- 页面 */

export default function GuidePage() {
  return (
    <div>
      <h1>排障手册</h1>
      <p className="sub">
        先判断是谁的问题，再决定要不要改配置。拿不准就用{' '}
        <Link href="/check">配置自检</Link> 跑一遍。
      </p>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>现象</th>
              <th>大概率是谁的问题</th>
              <th>第一步做什么</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>连不上、超时、连接被重置</td>
              <td>
                <span className="badge lv-down">网络 / 代理</span>
              </td>
              <td>确认代理开着且规则命中域名</td>
            </tr>
            <tr>
              <td>401 / 403</td>
              <td>
                <span className="badge lv-degraded">你的 key 或额度</span>
              </td>
              <td>重新复制 key，检查余额</td>
            </tr>
            <tr>
              <td>404</td>
              <td>
                <span className="badge lv-degraded">你的配置</span>
              </td>
              <td>检查 base_url、模型名、端点</td>
            </tr>
            <tr>
              <td>
                400 <span className="mono">请启用 1m 上下文</span>
              </td>
              <td>
                <span className="badge lv-degraded">你的客户端设置</span>
              </td>
              <td>给 Claude 请求加上 anthropic-beta 头</td>
            </tr>
            <tr>
              <td>
                429 <span className="mono">rate limit</span>
              </td>
              <td>
                <span className="badge lv-degraded">你的调用频率</span>
              </td>
              <td>关掉自动重试，降低并发</td>
            </tr>
            <tr>
              <td>
                429 <span className="mono">Service Unavailable</span>
              </td>
              <td>
                <span className="badge lv-down">中转站上游</span>
              </td>
              <td>渠道打满了，换个时段再来</td>
            </tr>
            <tr>
              <td>502 / 503 / 520 / 504</td>
              <td>
                <span className="badge lv-down">中转站上游</span>
              </td>
              <td>看一眼状态页，然后等或错峰</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="section" id="errors">
        <div className="section-head">
          <h2>错误码逐条</h2>
          <span className="hint">共 {ENTRIES.length} 条 · 点开看详情</span>
        </div>
        <div className="acc-list">
          {ENTRIES.map((e) => (
            <details key={e.code} className="acc">
              <summary>
                <span className="acc-key mono">{e.code}</span>
                <span className="acc-raw">{e.raw}</span>
                <span className={`badge ${WHO_STYLE[e.who]}`}>
                  {e.who === '不一定' ? '看情况' : `大概率是${e.who}的问题`}
                </span>
              </summary>
              <div className="acc-body">
                <p style={{ margin: '0 0 12px' }}>{e.meaning}</p>
                <div className="grid-2" style={{ gap: 18 }}>
                  <div>
                    <div className="acc-label">常见原因</div>
                    <ul className="acc-ul">
                      {e.causes.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="acc-label">怎么办</div>
                    <ul className="acc-ul">
                      {e.fixes.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className="section" id="clients">
        <div className="section-head">
          <h2>客户端怎么填</h2>
          <span className="hint">共 {GUIDES.length} 个 · 差一个 /v1 就报 404</span>
        </div>

        <div className="alert warn" style={{ marginBottom: 14 }}>
          <b>动手之前</b>
          <div className="dim" style={{ marginTop: 4 }}>
            ① 主站直连（<span className="mono">{ROUTES[0].baseUrl}</span>）必须开代理，
            而且代理规则要覆盖这个域名；② 每个客户端都标了要不要 <span className="mono">/v1</span>；
            ③ 模型名一律复制粘贴，手打必错；④ 用 Claude 模型时记得开「1M 上下文」，
            否则会拿到 400「请启用 1m 上下文」。
          </div>
        </div>

        <div className="acc-list">
          {GUIDES.map((g) => (
            <details key={g.name} className="acc">
              <summary>
                <span className="acc-key">{g.name}</span>
                <span className="acc-raw">{g.kind}</span>
                <span className={`badge ${g.baseUrlStyle === '不带 /v1' ? 'lv-degraded' : 'lv-ok'}`}>
                  base_url {g.baseUrlStyle}
                </span>
              </summary>
              <div className="acc-body">
                <table className="table">
                  <tbody>
                    {g.fields.map((f) => (
                      <tr key={f.k}>
                        <td style={{ width: 170, color: 'var(--text-dim)' }}>{f.k}</td>
                        <td className="mono">{f.v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {g.code ? <div className="code" style={{ marginTop: 12 }}>{g.code}</div> : null}
                <ul className="acc-ul" style={{ marginTop: 12 }}>
                  {g.tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
