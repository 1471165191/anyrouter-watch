export default function DataSourceNotice({ source }: { source: 'db' | 'demo' }) {
  if (source === 'db') return null;
  return (
    <div className="alert warn" style={{ marginBottom: 20 }}>
      <b>当前展示的是示例数据，不是真实探测结果</b>
      <div className="dim" style={{ marginTop: 4 }}>
        数据库里还没有探测记录，页面用模拟数据填充以便预览。配好 DATABASE_URL、执行建表、跑一次探测脚本之后，
        这里会自动切换成真实数据。
      </div>
    </div>
  );
}
