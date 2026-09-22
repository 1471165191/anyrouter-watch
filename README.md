# AnyRouter 观察站

中转站的第三方可用性观测站：**状态看板 + 配置自检 + 用户众包上报 + 排障讨论区**。

官方没有状态页，挂了只能在群里问「你们能用吗」。这个站就是回答那个问题的。

---

## 关于「线路」

调研社区反馈时发现一个常见配置误区：**AnyRouter 可能有多条接入线路，而「要不要开代理」是相反的。**
所以站点一开始是按 **线路 × 分组** 的矩阵来设计的，首页第一屏回答「现在该用哪条线路」。

**但目前只有一条线路是真的。** 2026-09-22 把四条地址全部实测了一遍：

| 线路 | 地址 | 实测结果 |
|---|---|---|
| 主站直连 | `https://anyrouter.top` | ✅ 可用，**必须科学上网** |
| 大陆优化 A | `https://pmpjfbhq.cn-nb1.rainapp.top` | ❌ `404 page not found` |
| 大陆优化 B | `https://a-ocnfniawgw.cn-shanghai.fcapp.run` | ❌ `403 Current user is in debt` |
| CDN 备用 | `https://q.quuvv.cn` | ❌ 连不上 |

问题不只是「三条不通」，而是页面把它们当正经线路展示、还参与「推荐线路」评选，
等于给用户指了三条死路。所以直接砍到只剩主站直连，探测矩阵从 4×4 降到 1×3。

代码结构没变 —— 想加线路就往 `lib/config.ts` 的 `ROUTES` 里追加一项
（`scripts/probe.mjs` 里有一份同名数组要同步改；`app/api/probe/route.ts` 直接读 config，不用改）。
**加之前先用 `curl` 实测一次 `/v1/models`，别再抄社区帖子里的地址。**

---

## 当前进度

**已经是真的**

- 全部页面与交互
- 探测数据链路：脚本探测 → 回传接口 → Postgres → 页面
- 用户上报：写入数据库、按 IP 哈希限频、聚合统计
- 讨论区：发帖 / 回复，同样走数据库 + 限频
- 配置自检：真的会请求你填的地址，三步验证并归责
- 开放数据接口：`/api/status`
- 数据库已建好：Supabase 项目 `anyrouter-watch`（Sydney），**6 张表全部启用 RLS**

**还是占位的**

- 数据库为空时，页面用示例数据填充（`lib/mock.ts`），并在顶部**明确标注**。
  这是刻意的：刚上线时库里没数据，空图表会让人以为站点坏了。
  现在还会进一步区分「连不上库」和「库里还没数据」—— 见 `/api/status` 的 `dbOk` 字段。

**已经上线**：<https://anyrouter-watch.vercel.app>（GitHub 仓库 `1471165191/anyrouter-watch`，
推送到 `main` 会自动部署）。当前探测数据是真的，所以状态页反映的是 AnyRouter 的真实状况。

**待办：配一个外部定时器。** GitHub Actions 的 `schedule` 实测不可靠
（配了 5 分钟 cron，一个半小时触发 0 次），所以新增了 `/api/probe`，
把「谁来定时触发」解耦出来。见 `DEPLOY.md` 的「打开定时探测」。

---

## 实测记下来的几条反直觉结论

这几条都是 2026-09-22 直接打接口打出来的，写在这里免得以后重新踩：

1. **不同模型族走不同端点**，模型名对了但端点不对，一样报
   `404 当前 API 不支持所选模型` —— 看着像模型不存在，其实是打错了接口。
   Claude → `/v1/messages`，GPT → `/v1/responses`，其余 → `/v1/chat/completions`。

2. **Claude 必须带 `anthropic-beta: context-1m-2025-08-07`**。
   不带这个头，任何 Claude 模型都返回
   `400 1m 上下文已经全量可用，请启用 1m 上下文后重试`（实测 3/3 稳定复现）；
   带上之后才轮到上游说话。这条坑了很多用户，站点的错误码表和自检都专门讲了。

3. **`/v1/models` 列表里有 ≠ 真的能调。**
   - `gemini-2.5-flash` 不在列表里（只有 `pro`）
   - `gpt-5-codex` 在列表里，但两个端点都回 404
   - `claude-opus-4-6` 在列表里，服务端明说「已下线，请切换到 claude-opus-4-7」
   所以模型名要以**实测打通**为准，不是以列表为准。

4. **429 有两种，含义相反。**
   `rate limit` 是你发太快（改客户端）；`Service Unavailable` 是渠道打满（只能等）。
   这个站过载时返回的正是后者，一律归成限流会给出错误的建议。

5. **站点官网整站挂了阿里云 WAF 的 JS 挑战**（`acw_sc__v2`），
   任何路径都返回同一段反爬页面。所以别指望程序化读它的公告来拿线路地址，
   拿不到；线路只能靠实测。

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

3 个目标逐个打印结果。确认能跑通再往下走。

> ⚠️ **换模型之前先看这里（2026-09-22 踩过大坑）**
>
> AnyRouter 不同模型族走的**接口格式不一样**，而且**模型名对了、端点不对，
> 一样会返回 `404 当前 API 不支持所选模型`** —— 看起来像模型不存在，其实是打错了接口。
> 当时照社区帖子抄的模型名（`gpt-4o-mini` / `o3-mini` / `deepseek-v3` / `qwen-max`）
> **一个都不存在**，导致探测全 404、站点一直显示「线路大面积不可用」。
>
> 实测正确的组合：
>
> | 分组 | 端点 | 请求体关键字段 | 认证头 |
> |---|---|---|---|
> | Claude 系 | `POST /v1/messages` | `max_tokens` + `messages` | `x-api-key` + `anthropic-version` + **`anthropic-beta: context-1m-2025-08-07`** |
> | GPT 系 | `POST /v1/responses` | `max_output_tokens` + `input` | `Authorization: Bearer` |
> | Gemini 系 | `POST /v1/chat/completions` | `max_tokens` + `messages` | `Authorization: Bearer` |
>
> **Claude 那个 `anthropic-beta` 头不能省。** 不带它，所有 Claude 模型都返回
> `400 1m 上下文已经全量可用，请启用 1m 上下文后重试`（实测 3/3 稳定复现），
> 跟 key、余额、负载都无关。带上之后请求才真正打到上游。
>
> **改之前先核对真实模型列表，但别只看列表：**
>
> ```bash
> curl -s https://anyrouter.top/v1/models -H "Authorization: Bearer sk-xxx" | head -c 800
> ```
>
> 列表里有 ≠ 真的能调：`gemini-2.5-flash` 不在列表里、`gpt-5-codex` 在列表里却两个端点都 404、
> `claude-opus-4-6` 在列表里但服务端说已下线。**以 `--dry` 实测打通为准。**
> 该账号下没有任何国产模型，所以 `domestic` 分组已删除。
>
> 另外 `/v1/chat/completions` 返回的 `404 当前 API 不支持所选模型` 和
> `500 当前模型 xxx 负载已经达到上限` 是**两回事**：
> 前者是模型/端点配错了，后者是模型没问题、只是上游挤爆了 —— 后者才是站点该记录的信号。

### 3. 部署

推到 GitHub，在 Vercel 导入仓库，配置环境变量：

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | Postgres 连接串 |
| `INGEST_SECRET` | 随机长字符串，探测接口的鉴权口令 |
| `ANYROUTER_KEY` | 服务端探测用的 key |

### 4. 打开定时探测

**主路径**：配一个外部定时器，每 5 分钟打一次

```bash
curl "https://你的域名/api/probe?secret=<你的 INGEST_SECRET>"
```

`/api/probe` 自己完成「探测 + 落库」整条链路，不需要任何外部 runner。
用 cron-job.org / UptimeRobot / Cloudflare Workers Cron 都行。

**备份路径**：GitHub Actions（仓库 Settings → Secrets 加
`ANYROUTER_KEY` / `INGEST_URL` / `INGEST_SECRET`），Actions 里手动触发一次验证。

> **为什么不只靠 GitHub Actions 的 schedule？**（2026-09-22 实测）
> `probe.yml` 的 5 分钟 cron 推上去后，**一个半小时触发 0 次** ——
> workflow 的 `state` 一直是 `active`、不报错、不告警，只能靠数 run 才发现没跑。
> GitHub 的 schedule 是尽力而为，新仓库和高负载时段都会延迟甚至直接丢弃。
> 对一个「每 5 分钟更新一次」的状态页来说这个不确定性不能接受，
> 所以才加了 `/api/probe` 把触发解耦出来。
>
> **为什么不放 Vercel Cron？** Vercel Hobby 计划的定时任务一天只能触发一次，
> 做不到 5 分钟粒度。

---

## 本项目的 Supabase 配置

数据库用的是 Supabase 项目 **`anyrouter-watch`**（Free 计划 / `ap-southeast-2` Sydney），
项目 ref 是 **`mghkaqxqqwlfjhseferj`**。

- 建表不是跑 `npm run db:init`，而是**在面板的 SQL Editor 里执行 `db/schema.sql`**，
  并选择「Run and enable RLS」。6 张表都已建好。
- `DATABASE_URL` 用的是 **Transaction pooler（6543）** —— serverless 每个请求都是短连接，
  直连会很快把连接数吃满。
- 直连（`db.<ref>.supabase.co:5432`）只走 IPv6，IPv4 网络连不上，要额外买 IPv4 add-on。
- 池化器主机是 `aws-0-ap-southeast-2.pooler.supabase.com`（注意是 **aws-0**，不是 aws-1）。

> ⚠️ **2026-09-22 事故：ref 抄错了一个字符，排查绕了很久**
>
> 症状：`pg` 连池化器报 `(ENOTFOUND) tenant/user postgres.<ref> not found`，
> 站点一直显示示例数据。
>
> **当时误判成「本机 Clash 的 fake-IP 把 DNS 搞坏了」**，理由看起来还挺硬：
> `*.supabase.co` 的 TLS 握手失败、26 个区域主机名返回一模一样的错误。
> 但部署到 Vercel（没有代理）后**照样失败**，说明这个结论是错的。
>
> 真正的原因是 ref 抄错了 —— 正确 `mghkaqxqqwlfjhseferj`，
> 误写成 `mghkaqxqwwlfjhesefrj`（`qqw`↔`qww`、`fe`↔`ef` 两处字符换位）。
>
> **一条命令就能分辨，别靠猜：**
>
> ```bash
> # 真实存在的 ref 会解析出 IP；不存在的返回 NXDOMAIN(status 3)
> curl -s "https://cloudflare-dns.com/dns-query?name=mghkaqxqqwlfjhseferj.supabase.co&type=A" \
>   -H 'Accept: application/dns-json'
> ```
>
> 另一个旁证：Supabase 面板的标签页标题**只在项目存在时才带项目名**。
> 打开错 ref 时标题是 `SQL Editor | Supabase`，打开对的是
> `SQL Editor | anyrouter-watch | 1471165191's Org | Supabase`。
>
> 结论：**改 `DATABASE_URL` 时从面板「Connect」对话框整串复制，不要手抄。**
> 字符换位（`qqw`/`qww`、`fe`/`ef`）肉眼极难发现，而 Supabase 的 ref 恰好全由
> 这类易混字符组成。
>
> 本机 Clash 的 fake-IP 确实存在（`*.supabase.co` 会被解析成 `28.0.0.x`），
> 但那只是干扰项，不是这次的原因。绕开它的办法是走 Clash 的 HTTP CONNECT 隧道
> （见技能 `clash-fakeip-bypass`）。

> 💡 **排查工具：`/api/health`**
> 需要 `x-ingest-secret` 请求头。它把 DNS → TCP → 查询 三步分开报，并列出库里的表，
> 用来区分「连不上库」和「库里还没数据」—— 这两种情况以前在页面上表现完全一样。


---

## 环境变量

见 `.env.example`。**全部可选**，不配任何变量站点也能跑（用示例数据）。

---

## 目录结构

```
app/
  page.tsx              首页：状态横幅 + 线路状态 + 上报/讨论 + 快捷入口（只有 4 段）
  status/page.tsx       详细看板：分组状态、时段热力图、可用率与延迟曲线、故障时间线
  report/page.tsx       用户上报：表单 + 汇总 + 全部上报流（不在导航里，从首页/讨论区进）
  discuss/page.tsx      讨论区：帖子列表 + 发帖
  discuss/[id]/page.tsx 帖子详情 + 回复
  check/page.tsx        配置自检：三步验证 + 常见坑
  guide/page.tsx        排障手册：错误码对照表 + 客户端配置（折叠式）
                        ← 由原 errors/ 与 clients/ 合并而来，旧地址 308 跳转
  api/status            开放数据接口（JSON）
  api/probe             服务端探测（探测 + 落库一条龙，供外部定时器调用）
  api/reports           上报读写（含限频）
  api/threads           讨论区读写（含限频）
  api/diagnose          自检代理（Edge，key 不落库）
  api/ingest            接收探测脚本回传的结果并写库
  api/health            运维自检：DNS / TCP / 查询分段报
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
scripts/
  probe.mjs             独立探测脚本（GitHub Actions 备份路径用）
```
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

数据量：1 条线路 × 3 个分组 × 每 5 分钟 ≈ **每天 860 行**。免费额度能撑很久，但建议定期清理：

```sql
delete from probes where ts < now() - interval '30 days';
```

---

## 几条必须守住的线

1. **自检工具绝不存 key。** `app/api/diagnose/route.ts` 现在是干净的：不写库、不写日志、不缓存。
   以后加功能别破坏这一点。页面上也提供等价的 curl 命令，让用户可以选择完全不给 key。
2. **数据库故障时宁可降级，不可白屏。** 所有取数走 `safeQuery`，失败退回示例数据并标注。
   但**写入失败不能假装成功** —— 上报会返回 503 并明确告诉用户没存上。
3. **探测用自己的账号，保持低频。** 5 分钟一次、3 个目标已经够。别加频率。
4. **站名不要用官方名。** 现在叫「AnyRouter 观察站」，页脚明确写了非官方、无关联。这个口吻要一直保持。
5. **讨论区只做「排障讨论」，不做内容社区。** 这一条改过：最早决定「社区不做」，
   后来发现用户真正缺的是「有没有人跟我一样」这个确认动作 —— 官方既没有状态页也没有群，
   于是加了 `threads` / `replies`。但它必须保持轻：帖子可挂线路、回复平铺、
   无等级无积分无审核队列，别让它长成一个需要运营的论坛。
6. **线路地址会变。** `lib/aggregate.ts` 里的 `likelyDead` 已经在区分「地址失效」和「临时故障」：
   所有分组都攒够样本、且窗口内一次都没成功，才判定失效并在页面上单独提示。
   判据放宽会让它乱报警，收紧则永远不触发 —— 改的时候想清楚。
7. **不确定的线路地址宁可不写。** 2026-09-22 的教训：抄来三条错地址，页面照样
   把它们当正经线路展示、还参与推荐评选，等于给用户指死路。写进 `ROUTES` 之前必须实测。
8. **定时触发不能只依赖 GitHub schedule。** 它不报错、状态还是 active，但就是不跑。
   改调度相关的东西时，一定要**数一下实际触发了多少次**，别只看配置在不在。

---

## 下一步可以做的

- **部署后第一件事**：打开 `/api/status` 看 `source` 是不是 `db`。
  本机代理连不上 Supabase 池化器（见「本项目的 Supabase 配置」那一节），
  所以真实连接必须在 Vercel 上验证
- **配一个外部定时器打 `/api/probe`** —— 目前唯一还没闭环的一环，见 `DEPLOY.md`
- 线路自动测速排序，把「当前最快线路」直接置顶（要等线路回到多条才有意义）
- 探测与上报交叉验证：官方探测正常但用户大量报错时，提示「可能是局部问题」
- 微信 / Telegram / Bark 故障推送
- 把 `/api/status` 做成徽章，方便别人贴到自己的 README
- 故障事件的人工补录后台
