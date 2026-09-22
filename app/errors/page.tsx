import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '错误码百科',
  description: 'AnyRouter 常见报错对照表：502、503、429、401、超时，以及「上游负载压力太大」这类报错原文的原因和解决办法。',
};

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
      '换一条线路再试，不同线路的上游可能不一样',
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
    fixes: [
      '先看状态页确认是不是全线都在 502，是的话等一会儿',
      '换线路（主站直连 ↔ 大陆优化）试试',
      '注意：502 不代表一定没扣费，去后台核对用量',
    ],
  },
  {
    code: '520',
    raw: 'Web server is returning an unknown error',
    who: '线路',
    meaning: 'Cloudflare 抛出的错误，表示回源失败 —— 多半是线路节点和源站之间断了。',
    causes: ['CDN 节点回源异常', '域名被解析到失效节点'],
    fixes: ['换线路', '清理本地 DNS 缓存后重试', '如果只有某一条线路 520，直接换掉它'],
  },
  {
    code: '429',
    raw: 'Too Many Requests / rate limit exceeded',
    who: '你',
    meaning: '触发了频率限制，请求被拒绝。这个和「负载高」不一样，是你发得太快了。',
    causes: ['短时间并发请求过多', '客户端有自动重试，越重试越糟', '共享 key 被多人同时使用'],
    fixes: ['把客户端的自动重试关掉或调大间隔', '降低并发数', '等 1–5 分钟再试'],
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
    raw: 'Forbidden / 额度不足 / 权限不足',
    who: '不一定',
    meaning: 'key 是有效的，但没有权限，或者额度用完了。',
    causes: ['当日额度耗尽', '分组权限不匹配（key 无权访问该分组）', '账号被限制'],
    fixes: ['去后台看余额和用量', '换一个自己有权限的分组', '确认 key 对应的分组设置'],
  },
  {
    code: '404',
    raw: 'Not Found / model not found',
    who: '你',
    meaning: '路径或模型名不对。base_url 写错和模型名写错都会报这个。',
    causes: ['base_url 少了或多写了 /v1', '模型名拼错、大小写不对、漏了日期后缀'],
    fixes: ['对照客户端配置页检查 base_url', '从站内模型列表复制准确的模型名'],
  },
  {
    code: '504',
    raw: 'Gateway Timeout / 请求超时',
    who: '上游',
    meaning: '服务端在限定时间内没返回结果。请求发出去了，但没人接。',
    causes: ['上游排队严重', '请求内容太长导致处理超时', '线路抖动'],
    fixes: ['缩短输入内容', '换线路重试', '把客户端的超时时间调大一些'],
  },
  {
    code: 'ECONNRESET',
    raw: 'Connection reset / 连接被重置 / 无法连接',
    who: '线路',
    meaning: 'TCP 连接直接被掐断，通常是网络层的问题，压根没到服务端。',
    causes: ['主站直连但没开代理（国内会超时或被重置）', '代理规则没覆盖到这个域名', 'DNS 污染'],
    fixes: [
      '主站直连必须开代理；不想开代理就换大陆优化线路',
      '检查代理软件的规则，确保这个域名走了代理',
      '把域名的 DNS 查询也交给代理',
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

export default function ErrorsPage() {
  return (
    <div>
      <h1>错误码百科</h1>
      <p className="sub">
        中转站的报错信息很少告诉你到底是谁的问题。这张表帮你对号入座 —— 先分清责任，再决定要不要改配置。
      </p>

      <div className="card">
        <h3>先看这一张，判断是谁的问题</h3>
        <table className="table" style={{ marginTop: 8 }}>
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
                <span className="badge lv-down">网络 / 线路</span>
              </td>
              <td>检查代理设置，或换大陆优化线路</td>
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
              <td>检查 base_url 和模型名</td>
            </tr>
            <tr>
              <td>429</td>
              <td>
                <span className="badge lv-degraded">你的调用频率</span>
              </td>
              <td>关掉自动重试，降低并发</td>
            </tr>
            <tr>
              <td>502 / 503 / 520 / 504</td>
              <td>
                <span className="badge lv-down">中转站上游</span>
              </td>
              <td>去状态页看看，然后换线路或等</td>
            </tr>
          </tbody>
        </table>
        <div className="faint" style={{ fontSize: 12, marginTop: 12 }}>
          拿不准的话，用 <Link href="/check">配置自检</Link> 跑一遍，三步就能定位到具体环节。
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>逐条详解</h2>
          <span className="hint">共 {ENTRIES.length} 条</span>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          {ENTRIES.map((e) => (
            <div key={e.code} className="card">
              <div className="route-top" style={{ marginBottom: 8 }}>
                <span className="route-name mono" style={{ fontSize: 15 }}>
                  {e.code}
                </span>
                <span className={`badge ${WHO_STYLE[e.who]}`}>
                  {e.who === '不一定' ? '看情况' : `大概率是${e.who}的问题`}
                </span>
              </div>
              <div className="mono" style={{ color: 'var(--text-dim)', marginBottom: 10, wordBreak: 'break-word' }}>
                {e.raw}
              </div>
              <div style={{ marginBottom: 12 }}>{e.meaning}</div>
              <div className="grid-2" style={{ gap: 18 }}>
                <div>
                  <h3 className="faint">常见原因</h3>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-dim)' }}>
                    {e.causes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="faint">怎么办</h3>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-dim)' }}>
                    {e.fixes.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
