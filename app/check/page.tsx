import type { Metadata } from 'next';
import Link from 'next/link';
import DiagnosePanel from '@/components/DiagnosePanel';

export const metadata: Metadata = {
  title: '配置自检',
  description: '三步判断到底是网络、key、模型名还是中转站本身的问题，key 不落库不记日志。',
};

/**
 * 坑位从「7 张大卡片」改成「一张卡里 7 条紧凑条目」。
 * 内容一条没删，但视觉上不再是 7 个抢注意力的方块。
 */
const PITFALLS = [
  {
    title: '代理没开，或者规则没命中域名',
    body: '主站直连必须科学上网。只开代理不等于走了代理 —— 规则用的是白名单、而这个域名不在名单里，照样直连被重置。这是最常见的「怎么都用不了」。',
  },
  {
    title: 'base_url 结尾多写或少写 /v1',
    body: '有的客户端要你填到 /v1，有的只填域名。填错就是 404 或 401，看着像 key 的问题，其实不是。',
  },
  {
    title: '模型名复制错',
    body: '带日期后缀的模型名很容易抄漏，大小写也要对。名字不在列表里，服务端会直接拒绝。',
  },
  {
    title: '端点选错了（很容易误判成模型名错）',
    body: '这类站不同模型族走的接口不一样：Claude 走 /v1/messages，GPT 走 /v1/responses，其余走 /v1/chat/completions。用错了同样返回「当前 API 不支持所选模型」—— 看着像模型不存在，其实是端点不对。上面的自检会按模型名自动挑端点。',
  },
  {
    title: 'Claude 报「请启用 1m 上下文」',
    body: '这不是故障，也不是 key 或余额的问题。这个站要求 Claude 请求显式声明使用 1M 上下文窗口，没声明就直接拒。在请求头加上 anthropic-beta: context-1m-2025-08-07 即可，Cherry Studio 这类客户端在模型设置里勾「1M 上下文」会自动带上。',
  },
  {
    title: 'key 里混进空格换行',
    body: '从网页复制 key 时经常带上首尾空格或换行，肉眼看不出来，但鉴权一定失败。',
  },
  {
    title: '上下文太长被拒',
    body: '社区反馈长上下文更容易触发「上游负载压力太大」。开新会话、缩短历史记录，往往立刻就好。',
  },
  {
    title: '其实真的是站挂了',
    body: '如果自检显示网络和鉴权都过、只是补全失败，那就是上游的问题。别改配置了，改也没用。',
  },
];

export default function CheckPage() {
  return (
    <div>
      <h1>配置自检</h1>
      <p className="sub">
        「中转站用不了」有一半是配置问题，另一半是真挂了。三步就能分清是哪一种 —— 不用再到处问人。
      </p>

      <div className="card">
        <DiagnosePanel />
      </div>

      <div className="section">
        <div className="section-head">
          <h2>最常见的坑</h2>
          <span className="hint">按踩坑频率排序 · 更全的对照表在<Link href="/guide">排障手册</Link></span>
        </div>
        <div className="card">
          <ol className="pit-list">
            {PITFALLS.map((p) => (
              <li key={p.title}>
                <b>{p.title}</b>
                <span>{p.body}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
