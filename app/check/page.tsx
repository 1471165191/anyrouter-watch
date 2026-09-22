import type { Metadata } from 'next';
import DiagnosePanel from '@/components/DiagnosePanel';

export const metadata: Metadata = {
  title: '配置自检',
  description: '三步判断到底是网络、key、模型名还是中转站本身的问题，key 不落库不记日志。',
};

const PITFALLS = [
  {
    title: '代理开错了',
    body: '主站直连必须科学上网，大陆优化线路反而不要开代理。开着代理走大陆优化线路，是最常见的「怎么都用不了」。',
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
          <h2>六个最常见的坑</h2>
          <span className="hint">按踩坑频率排序</span>
        </div>
        <div className="grid-2">
          {PITFALLS.map((p) => (
            <div key={p.title} className="card">
              <h3>{p.title}</h3>
              <div className="dim" style={{ fontSize: 12.5 }}>
                {p.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
