# AnyRouter 观察站

中转站的第三方可用性观测站：**状态看板 + 配置自检 + 用户众包上报 + 排障讨论区**。

官方没有状态页，挂了只能在群里问「你们能用吗」。这个站就是回答那个问题的。

---

## 为什么是「线路」而不是「站点」

调研社区反馈时发现的头号配置误区：**AnyRouter 有多条接入线路，而「要不要开代理」完全相反。**

| 线路 | 地址 | 代理 |
|---|---|---|
| 主站直连 | `https://anyrouter.top` | **必须科学上网** |
| 大陆优化 A | `https://pmpjfbhq.cn-nb1.rainapp.top` | 免代理 |
| 大陆优化 B | `https://a-ocnfniawgw.cn-shanghai.fcapp.run` | 免代理 |
| CDN 备用 | `https://q.quuvv.cn` | 免代理 |

所以探测矩阵是 **线路 × 分组**（4×4 = 16 个目标），首页第一屏回答的就是「现在该用哪条线路」。
线路地址定义在 `lib/config.ts`，会变，请定期核实。

---

## 当前进度

**已经是真的**

- 全部页面与交互
- 探测数据链路：脚本探测 → 回传接口 → Postgres → 页面
- 用户上报：写入数据库、按 IP 哈希限频、聚合统计
- 讨论区：发帖 / 回复，可按线路筛选，同样走数据库 + 限频
- 配置自检：真的会请求你填的地址，三步验证并归责
- 定时任务：GitHub Actions 每 5 分钟一次
- 开放数据接口：`/api/status`
- 数据库已建好：Supabase 项目 `anyrouter-watch`（Sydney），**6 张表全部启用 RLS**

**还是占位的**

- 数据库为空时，页面用示例数据填充（`lib/mock.ts`），并在顶部**明确标注**。
  这是刻意的：刚上线时库里没数据，空图表会让人以为站点坏了。

也就是说：**配好 `DATABASE_URL`、执行一次建表、跑一次探测，站点就是全真的。**

---

## 本地运行

```bash
npm install
npm run dev          # http://localhost:3000
```

不需要数据库也能跑 —— 会自动退回示例数据。

试探测脚本（不回传，只在终端打印）：

```bash
ANYROUTER_KEY=sk-你的key node scripts/probe.mjs --dry
```

---

## 接上真实数据（4 步）

### 1. 建库

Neon 或 Supabase 都行，控制台直接复制连接串。

```bash
cp .env.example .env.local     # 填入 DATABASE_URL 和 INGEST_SECRET
npm run db:init                # 建表，幂等，可重复执行
```

### 2. 本地验证探测

```bash
ANYROUTER_KEY=sk-xxx node scripts/probe.mjs --dry
```

16 个目标逐个打印结果。确认能跑通再往下走。

### 3. 部署

推到 GitHub，在 Vercel 导入仓库，配置环境变量：

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | Postgres 连接串 |
| `INGEST_SECRET` | 随机长字符串，回传接口的鉴权口令 |

### 4. 打开定时探测

在 GitHub 仓库 Settings → Secrets 里加：

| Secret | 值 |
|---|---|
| `ANYROUTER_KEY` | 探测用的 key（**用自己账号，会消耗额度**） |
| `INGEST_URL` | `https://你的域名/api/ingest` |
| `INGEST_SECRET` | 与 Vercel 上一致 |

Actions 里手动触发一次 `probe` workflow 验证，之后每 5 分钟自动跑。

> **为什么探测不放 Vercel Cron？**
> Vercel Hobby 计划的定时任务一天只能触发一次，做不到 5 分钟粒度。
> GitHub Actions 的 cron 最小间隔正好是 5 分钟，免费。
> 代价是高峰期可能延迟几分钟，可以接受。要更准就换 Cloudflare Workers Cron（1 分钟粒度，也免费）。

---

## 本项目的 Supabase 配置

数据库用的是 Supabase 项目 **`anyrouter-watch`**（Free 计划 / `ap-southeast-2` Sydney）。

- 建表不是跑 `npm run db:init`，而是**在面板的 SQL Editor 里执行 `db/schema.sql`**，
  并选择「Run and enable RLS」。6 张表都已建好。
- `DATABASE_URL` 用的是 **Transaction pooler（6543）** —— serverless 每个请求都是短连接，
  直连会很快把连接数吃满。
- 直连（`db.<ref>.supabase.co:5432`）只走 IPv6，IPv4 网络连不上，要额外买 IPv4 add-on。

> ⚠️ **本机代理的坑（重要，别重复踩）**
> 这台机器的 Clash 开了 fake-IP + TUN，会把 `*.supabase.co` 解析成 `28.0.0.x` 这类假地址，
> 结果是：
> - `curl https://<ref>.supabase.co/...` → TLS 握手直接失败
> - `pg` 连池化器 → 报 `(ENOTFOUND) tenant/user postgres.<ref> not found`
> - **26 个区域主机名返回一模一样的错误** —— 说明 DNS 全被解析到了同一个错的地方
>
> 判断方法：`supabase.com` 能拿到真的 Let's Encrypt 证书，`*.supabase.co` 拿不到。
> **这不是项目或连接串的问题，是代理规则的问题。**
> 要么给 `*.supabase.co` / `*.pooler.supabase.com` 单独配好分流，要么别在本机连，
> 直接部署到 Vercel 验证（Vercel 没有这层代理）。
>
> 所以本地跑起来 `source` 是 `demo` 属于预期行为 —— 降级逻辑正常工作。

---

## 环境变量

见 `.env.example`。**全部可选**，不配任何变量站点也能跑（用示例数据）。

---

## 目录结构

```
app/
  page.tsx              首页：总览 + 线路推荐 + 时段热力图 + 上报入口 + 故障时间线
  status/page.tsx       详细看板：分组 × 线路矩阵、各线路延迟趋势
  report/page.tsx       用户上报：表单 + 汇总 + 全部上报流
  discuss/page.tsx      讨论区：帖子列表 + 发帖，可按线路筛选
  discuss/[id]/page.tsx 帖子详情 + 回复
  check/page.tsx        配置自检：三步验证 + 常见坑
  errors/page.tsx       错误码百科
  clients/page.tsx      客户端配置教程
  api/status            开放数据接口（JSON）
  api/reports           上报读写（含限频）
  api/threads           讨论区读写（含限频）
  api/diagnose          自检代理（Edge，key 不落库）
  api/ingest            接收探测结果并写库
components/
  Nav / viz / ReportForm / ReportFeed / DiagnosePanel / DataSourceNotice
  ThreadForm / ReplyForm
lib/
  config.ts             线路、分组、客户端、常量   ← 改线路只改这里
  types.ts              类型定义
  db.ts                 连接池 + safeQuery（出错不让整站 500）
  probes.ts             探测数据取数（有库走库，无库走示例）
  aggregate.ts          纯聚合逻辑，无 IO
  stats.ts              页面统一取数入口
  mock.ts               示例数据生成器（仅兜底用）
  store.ts              上报存储 + 限频
  discuss.ts            讨论区存储 + 限频
db/schema.sql           建表语句（6 张表，含 RLS）
scripts/probe.mjs       探测脚本
scripts/init-db.mjs     建表脚本
.github/workflows/      每 5 分钟调度
```

---

## 数据模型

`db/schema.sql` 里有完整定义，六张表：

- `probes` — 探测明细（线路、分组、时间、成功与否、状态码、延迟、错误码、探测地区）
- `incidents` — 故障事件，可自动聚合也可人工补录
- `reports` — 用户上报
- `threads` — 讨论区帖子（可挂在线路 / 分组上）
- `replies` — 帖子回复，`thread_id` 外键级联删除
- `report_throttle` — 限频，**存的是 IP 哈希不是 IP 本身**

全部表都开了 **RLS**。应用走 `DATABASE_URL`（postgres 用户）天然绕过 RLS，
而 anon key 是公开的 —— 不开 RLS 等于把表直接敞开。以后要在浏览器端直连，再按需加 policy。

数据量：4 条线路 × 4 个分组 × 每 5 分钟 ≈ **每天 4600 行**。免费额度能撑很久，但建议定期清理：

```sql
delete from probes where ts < now() - interval '30 days';
```

---

## 几条必须守住的线

1. **自检工具绝不存 key。** `app/api/diagnose/route.ts` 现在是干净的：不写库、不写日志、不缓存。
   以后加功能别破坏这一点。页面上也提供等价的 curl 命令，让用户可以选择完全不给 key。
2. **数据库故障时宁可降级，不可白屏。** 所有取数走 `safeQuery`，失败退回示例数据并标注。
   但**写入失败不能假装成功** —— 上报会返回 503 并明确告诉用户没存上。
3. **探测用自己的账号，保持低频。** 5 分钟一次、16 个目标已经够。别加频率。
4. **站名不要用官方名。** 现在叫「AnyRouter 观察站」，页脚明确写了非官方、无关联。这个口吻要一直保持。
5. **讨论区只做「排障讨论」，不做内容社区。** 这一条改过：最早决定「社区不做」，
   后来发现用户真正缺的是「有没有人跟我一样」这个确认动作 —— 官方既没有状态页也没有群，
   于是加了 `threads` / `replies`。但它必须保持轻：帖子可挂线路、回复平铺、
   无等级无积分无审核队列，别让它长成一个需要运营的论坛。
6. **线路地址会变。** `lib/aggregate.ts` 里的 `likelyDead` 已经在区分「地址失效」和「临时故障」：
   所有分组都攒够样本、且窗口内一次都没成功，才判定失效并在页面上单独提示。
   判据放宽会让它乱报警，收紧则永远不触发 —— 改的时候想清楚。

---

## 下一步可以做的

- **部署后第一件事**：打开 `/api/status` 看 `source` 是不是 `db`。
  本机代理连不上 Supabase 池化器（见「本项目的 Supabase 配置」那一节），
  所以真实连接必须在 Vercel 上验证
- 线路自动测速排序，把「当前最快线路」直接置顶
- 探测与上报交叉验证：官方探测正常但用户大量报错时，提示「可能是局部问题」
- 微信 / Telegram / Bark 故障推送
- 把 `/api/status` 做成徽章，方便别人贴到自己的 README
- 故障事件的人工补录后台
