/**
 * 数据源提示条。
 *
 * 关键在于把「连不上库」和「库里还没数据」分开说 ——
 * 这两种情况以前都只表现为「示例数据」，排查时全靠猜。
 * 见 2026-09-22 那次 Supabase ref 抄错的事故：站点显示示例数据，
 * 但真正的原因（池化器报 tenant not found）被这句话盖住了。
 */
export default function DataSourceNotice({
  source,
  dbOk,
}: {
  source: 'db' | 'demo';
  /** 不传表示调用方不区分这两种情况，按「还没数据」处理 */
  dbOk?: boolean;
}) {
  if (source === 'db') return null;

  if (dbOk === false) {
    return (
      <div className="alert dead" style={{ marginBottom: 20 }}>
        <b>数据库连不上，当前展示的是示例数据</b>
        <div className="dim" style={{ marginTop: 4 }}>
          这是站点自己的问题，不是 AnyRouter 的。运维自检见 <code>/api/health</code>（需要
          <code>x-ingest-secret</code> 头），它会依次报出 DNS、TCP、查询三步的结果。
        </div>
      </div>
    );
  }

  return (
    <div className="alert warn" style={{ marginBottom: 20 }}>
      <b>还没有探测数据，当前展示的是示例数据</b>
      <div className="dim" style={{ marginTop: 4 }}>
        数据库是通的，但里面还没有探测记录。等探测任务跑完第一轮，这里会自动切换成真实数据。
      </div>
    </div>
  );
}
