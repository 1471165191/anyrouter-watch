import type { Metadata } from 'next';
import { ROUTES } from '@/lib/config';

export const metadata: Metadata = {
  title: '客户端配置',
  description: 'Cherry Studio、Cline、Cursor、NextChat、LobeChat、Python SDK 等客户端接入 AnyRouter 的字段填法，重点讲清楚 base_url 要不要带 /v1。',
};

interface ClientGuide {
  name: string;
  kind: string;
  baseUrlStyle: '带 /v1' | '不带 /v1' | '两种都行';
  fields: { k: string; v: string }[];
  tips: string[];
  code?: { lang: string; text: string };
}

const GUIDES: ClientGuide[] = [
  {
    name: 'Cherry Studio',
    kind: '桌面客户端',
    baseUrlStyle: '带 /v1',
    fields: [
      { k: 'API 类型', v: 'OpenAI' },
      { k: 'API 地址', v: '线路地址 + /v1，例如 https://xxx.top/v1' },
      { k: 'API 密钥', v: '你的 key' },
      { k: '模型', v: '点「获取模型列表」，然后从里面勾，别手打' },
    ],
    tips: [
      '填完一定要点一下「测试」，通过再用',
      '如果开了代理，确认代理规则覆盖了这个域名',
      '模型列表拉不出来，多半是地址结尾多了或少了一个 /v1',
    ],
  },
  {
    name: 'Cline / Roo Code',
    kind: 'VSCode 插件',
    baseUrlStyle: '带 /v1',
    fields: [
      { k: 'API Provider', v: 'OpenAI Compatible' },
      { k: 'Base URL', v: '线路地址 + /v1' },
      { k: 'API Key', v: '你的 key' },
      { k: 'Model ID', v: '从站内模型列表复制完整名字' },
    ],
    tips: [
      '这类插件请求量大，很容易撞 429，建议把并发和自动重试调保守',
      '上下文开太大时更容易遇到「上游负载压力太大」',
      '同一个 key 不要同时给多个插件用',
    ],
  },
  {
    name: 'Cursor',
    kind: 'IDE',
    baseUrlStyle: '带 /v1',
    fields: [
      { k: 'Override OpenAI Base URL', v: '线路地址 + /v1' },
      { k: 'API Key', v: '你的 key' },
      { k: 'Model', v: '手动添加模型名' },
    ],
    tips: [
      'Cursor 会高频发请求，中转站很容易限流，建议只在小范围开启自定义模型',
      '验证按钮失败不代表不能用，可以先直接对话试一次',
    ],
  },
  {
    name: 'NextChat / ChatGPT-Next-Web',
    kind: '网页 / 自部署',
    baseUrlStyle: '不带 /v1',
    fields: [
      { k: '接口地址', v: '线路地址（结尾不要带 /v1）' },
      { k: 'API Key', v: '你的 key' },
      { k: '自定义模型名', v: '手动填写，逗号分隔' },
    ],
    tips: ['NextChat 会自己在结尾拼 /v1，你再带上就变成 /v1/v1，直接 404'],
  },
  {
    name: 'LobeChat',
    kind: '网页 / 自部署',
    baseUrlStyle: '带 /v1',
    fields: [
      { k: '接口代理地址', v: '线路地址 + /v1' },
      { k: 'API Key', v: '你的 key' },
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
      { k: '自定义 API 地址', v: '线路地址 + /v1' },
      { k: 'API Key', v: '你的 key' },
      { k: '模型', v: '建议选便宜的型号，翻译量大会很快耗额度' },
    ],
    tips: ['并发调低一些，否则很容易触发限流', '翻译场景建议单独用一个 key，方便排查用量'],
  },
  {
    name: 'Python (openai SDK)',
    kind: '代码',
    baseUrlStyle: '带 /v1',
    fields: [
      { k: 'base_url', v: '线路地址 + /v1' },
      { k: 'api_key', v: '你的 key' },
    ],
    tips: ['建议从环境变量读 key，别写死在代码里', '务必设置 timeout，中转站抖动时默认等待会卡很久'],
    code: {
      lang: 'python',
      text: `from openai import OpenAI
import os

client = OpenAI(
    base_url=os.environ["ANYROUTER_BASE_URL"],  # https://xxx.top/v1
    api_key=os.environ["ANYROUTER_KEY"],
    timeout=60.0,
    max_retries=1,          # 中转站不稳，重试太多反而加重限流
)

resp = client.chat.completions.create(
    model="gemini-2.5-flash",   # 走 /v1/chat/completions 的模型
    messages=[{"role": "user", "content": "ping"}],
    max_tokens=16,
)
print(resp.choices[0].message.content)`,
    },
  },
  {
    name: 'Node.js (openai SDK)',
    kind: '代码',
    baseUrlStyle: '带 /v1',
    fields: [
      { k: 'baseURL', v: '线路地址 + /v1' },
      { k: 'apiKey', v: '你的 key' },
    ],
    tips: ['Node 18+ 自带 fetch，不需要额外配置'],
    code: {
      lang: 'javascript',
      text: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: process.env.ANYROUTER_BASE_URL, // https://xxx.top/v1
  apiKey: process.env.ANYROUTER_KEY,
  timeout: 60000,
  maxRetries: 1,
});

const resp = await client.chat.completions.create({
  model: "gemini-2.5-flash", // 走 /v1/chat/completions 的模型
  messages: [{ role: "user", content: "ping" }],
  max_tokens: 16,
});
console.log(resp.choices[0].message.content);`,
    },
  },
];

export default function ClientsPage() {
  return (
    <div>
      <h1>客户端配置</h1>
      <p className="sub">
        同一个站，不同客户端的填法不一样 —— 差一个 <span className="mono">/v1</span> 就会报 404，
        然后大家以为是 key 坏了。这里把每个客户端的字段逐个列清楚。
      </p>

      <div className="card">
        <h3>动手之前先记住三件事</h3>
        <ol style={{ margin: '8px 0 0', paddingLeft: 20, color: 'var(--text-dim)', fontSize: 13 }}>
          <li>
            <b style={{ color: 'var(--text)' }}>先选线路。</b>
            主站直连（{ROUTES[0].baseUrl}）必须开代理；大陆优化线路（{ROUTES[1].name}、
            {ROUTES[2].name}）不要开代理。选错了怎么配都用不了。
          </li>
          <li>
            <b style={{ color: 'var(--text)' }}>再看要不要 /v1。</b>
            下面每个客户端都标了。填错了不是报 401 就是报 404。
          </li>
          <li>
            <b style={{ color: 'var(--text)' }}>模型名一律复制粘贴。</b>
            手打必错，尤其是带日期后缀的。
          </li>
        </ol>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>逐客户端说明</h2>
          <span className="hint">共 {GUIDES.length} 个</span>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          {GUIDES.map((g) => (
            <div key={g.name} className="card">
              <div className="route-top" style={{ marginBottom: 10 }}>
                <span className="route-name">{g.name}</span>
                <span className="badge neutral">{g.kind}</span>
                <span
                  className={`badge ${g.baseUrlStyle === '不带 /v1' ? 'lv-degraded' : 'lv-ok'}`}
                  style={{ marginLeft: 'auto' }}
                >
                  base_url {g.baseUrlStyle}
                </span>
              </div>

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

              {g.code ? (
                <div className="code" style={{ marginTop: 12 }}>
                  {g.code.text}
                </div>
              ) : null}

              <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--text-dim)' }}>
                {g.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
