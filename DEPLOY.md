# 部署清单

## 只有一步需要你本人操作

AI 没有你的 GitHub / Vercel 账号凭据，**授权那一步必须你来点**。
其余都准备好了：仓库已初始化、46 个文件已提交、构建已用 Vercel 完全相同的命令验证通过。

---

## 路线 A：GitHub → Vercel（推荐）

**为什么推荐这条**：站点每 5 分钟的探测跑在 GitHub Actions 上
（Vercel Hobby 计划的 Cron 一天只能触发一次，做不到 5 分钟粒度），
所以 GitHub 仓库本来就得有。

### 1. 建仓库并推送

在 GitHub 上新建一个**空仓库**（不要勾选 README / .gitignore / license），然后：

```bash
cd D:\anyrouter中转
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

> 首次推送会弹 GitHub 授权（浏览器或 Personal Access Token）。
> 仓库里的 `.env.local` 已被忽略，**数据库密码不会**被推上去。

### 2. 在 Vercel 导入

1. 打开 https://vercel.com/new
2. `Import Git Repository` → 选中刚推上去的仓库
3. Framework 会自动识别为 Next.js，**构建命令和输出目录都不用改**
4. 展开 `Environment Variables`，加下面两个变量
5. Deploy

### 3. 环境变量

| 变量 | 值 | 说明 |
|---|---|---|
| `DATABASE_URL` | Supabase 的 Transaction pooler 连接串 | 值在 `.env.local` 里，直接复制 |
| `INGEST_SECRET` | 与 `.env.local` 里一致 | 探测接口的鉴权口令 |
| `ANYROUTER_KEY` | 你自己的 AnyRouter key | 服务端探测用，会消耗额度 |

三个都要加到 **Production / Preview / Development** 三个环境。

### 4. 打开定时探测

**推荐做法：让一个外部定时器打 `/api/probe`。**

```bash
curl "https://<你的域名>/api/probe?secret=<你的 INGEST_SECRET>"
```

这个端点自己完成「探测 + 落库」整条链路，不依赖任何外部 runner。
用 [cron-job.org](https://cron-job.org)（免费，1 分钟粒度）或 UptimeRobot
建一个每 5 分钟的监控指向上面这个 URL 就行。

> ⚠️ **为什么不默认用 GitHub Actions 的 schedule**（2026-09-22 实测）：
> `probe.yml` 里配的 5 分钟 cron，推上去 **一个半小时内触发 0 次**
> （`GET /repos/.../actions/runs?event=schedule` 的 `total_count` 是 0，
> 而 workflow 的 `state` 一直是 `active`，不报错、不告警）。
> GitHub 的 schedule 是尽力而为：新仓库、高负载时段会延迟甚至直接丢掉。
> 对一个「每 5 分钟更新一次」的状态页来说，这个不确定性不能接受。
>
> 所以现在有两套触发，互不依赖：
> - `/api/probe` + 外部定时器 —— **主路径**
> - GitHub Actions workflow —— 备份，哪天 schedule 正常了也能用
>
> 备份路径需要三个 Actions secrets：`ANYROUTER_KEY` / `INGEST_URL`
> （`https://<你的域名>/api/ingest`）/ `INGEST_SECRET`。
> 配好之后 Actions → probe → Run workflow 手动跑一次确认。

**怎么确认定时任务真的在跑？** 别只看绿勾，数 run 数量：

```bash
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/<owner>/<repo>/actions/runs?event=schedule" \
  | grep total_count
```

`/api/probe` 这边则看探测记录的时间戳有没有每 5 分钟递增一次
（`/status` 页最下面的「最后探测」）。

---

## 路线 B：只用 Vercel CLI（想先看效果）

```bash
cd D:\anyrouter中转
npx vercel login      # 浏览器授权，需要你点一下
npx vercel --prod
```

部署完到 Vercel 面板 → Settings → Environment Variables 加那两个变量，再 Redeploy 一次。

> 这条路线**没有定时探测**。5 分钟粒度必须靠 GitHub Actions，
> 所以最终还是得回到路线 A。

---

## 部署后第一件事：验证数据库真的连上了

打开 `https://<你的域名>/api/status`，看返回 JSON 里的 `source` 和 `dbOk` 两个字段：

| `source` | `dbOk` | 含义 | 该做什么 |
| --- | --- | --- | --- |
| `db` | `true` | **成功**，探测数据和用户上报都是真的 | 无 |
| `demo` | `true` | 库是通的，只是还没有探测记录 | 等第一轮探测，或手动触发一次 workflow |
| `demo` | `false` | **连不上库** | 看下面 |

`source=demo` 且 `dbOk=false` 时，直接查运维自检端点，它会把三步分开报：

```bash
curl -H "x-ingest-secret: <你的 INGEST_SECRET>" https://<你的域名>/api/health
```

- `dns` 为空 → 主机名解析不了（ref 写错了？）
- `tcp.ok=false` → 端口连不上
- `query.ok=false` → TCP 通了但认证/查询失败，看 `query.error`

> **踩过的坑**：2026-09-22 部署后一直 `source=demo`，一开始误判成本机 Clash 代理的问题，
> 实际是 `DATABASE_URL` 里的 Supabase ref 抄错了一个字符（`qqw`↔`qww`、`fe`↔`ef`）。
> 从 Vercel 侧看到 `(ENOTFOUND) tenant/user postgres.<ref> not found` 才定位到。
> 详见 README 的「本项目的 Supabase 配置」。


---

## 部署进度（2026-09-22 更新）

**已经做完的：**

- ✅ GitHub 仓库 `1471165191/anyrouter-watch`（**public**）已创建并推送
  - 选 public 不是随便定的：私有仓库的 Actions 免费额度是 2000 分钟/月，
    而 5 分钟一次探测 ≈ 8600 次/月，会直接跑爆。公开仓库的 Actions 不限量。
- ✅ Vercel 项目 `anyrouter-watch` 已创建并关联该仓库（production 分支 `main`）
- ✅ Vercel 环境变量 `DATABASE_URL` / `INGEST_SECRET` / `ANYROUTER_KEY` 已写入
- ✅ Supabase 6 张表已建好，RLS 已开；线上 `/api/health` 返回「数据库连接正常」
- ✅ GitHub Actions secrets 已写入 `INGEST_URL` / `INGEST_SECRET` / `ANYROUTER_KEY`
- ✅ **线上探测已跑通**：`/api/status` 返回 `source=db`、`dbOk=true`
- ✅ 端到端验证过：`/api/ingest` 写入 → `/api/status` 读出 `source=db`（验证用的合成数据已删除）
- ✅ 讨论区已可用，站长的欢迎帖已发出
- ✅ `.gitattributes` 统一换行符（Windows 开发 / Linux 构建）
- ✅ `npm run build` 用 Vercel 完全相同的命令跑通
- ✅ `.env.local` / `_tools/` 已忽略，**密钥没进仓库**
- ✅ **线路清单已收敛**：删掉三条实测失效的地址，只留主站直连（见下）
- ✅ **新增 `/api/probe`**，把「谁来定时触发」从 GitHub Actions 解耦（见「打开定时探测」）

**还没做的 / 需要你决定的：**

- ⚠️ **配一个外部定时器打 `/api/probe`**。这是目前唯一还没闭环的一环 ——
  没有它，站点不会有新数据。见上面「打开定时探测」。

- ⚠️ git 提交身份目前是占位的（`anyrouter-watch dev <dev@anyrouter-watch.local>`）。
  想换成你自己的：

  ```bash
  git config user.name "你的名字"
  git config user.email "你的邮箱"
  git commit --amend --reset-author --no-edit
  ```

- ⚠️ 本次用到的 GitHub PAT 和 Vercel token 都出现在对话记录里了，**用完请吊销**。

---

## 线路清单为什么只剩一条

上一版抄了四条地址，实测只有第一条是真的：

| 线路 | 地址 | 实测结果 |
|---|---|---|
| 主站直连 | `https://anyrouter.top` | ✅ 可用 |
| 大陆优化 A | `https://pmpjfbhq.cn-nb1.rainapp.top` | ❌ `404 page not found` |
| 大陆优化 B | `https://a-ocnfniawgw.cn-shanghai.fcapp.run` | ❌ `403 Current user is in debt` |
| CDN 备用 | `https://q.quuvv.cn` | ❌ 连不上 |

问题不只是「三条不通」，而是**页面把它们当正经线路展示、还参与「推荐线路」评选**，
等于给用户指了三条死路。所以 2026-09-22 直接砍到只剩主站直连。

要加回线路，改两处（必须一致）：

- `lib/config.ts` 的 `ROUTES`
- `scripts/probe.mjs` 的 `ROUTES`
- （`app/api/probe/route.ts` 不用改，它直接读 `lib/config.ts`）

加之前先用 `curl` 实测一次 `/v1/models` 能不能通，别再抄社区帖子里的地址。

---

## 怎么自己触发一次探测

**最快的方式**（不用碰 GitHub）：

```bash
curl "https://<你的域名>/api/probe?secret=<你的 INGEST_SECRET>"
```

返回 JSON 里有 `probed` / `succeeded` / `stored` 三个数，`stored` 等于 `probed`
就说明探测和落库都成功了。跑完刷新 `/status` 就能看到新数据。

也可以去 GitHub 仓库的 **Actions → probe → Run workflow** 手动跑一次。

如果失败，先分清是哪一层：
- `/api/probe` 返回 403 → `secret` 不对
- `/api/probe` 返回 `ANYROUTER_KEY 未配置` → Vercel 环境变量没加，加完要 Redeploy
- `/api/probe` 返回「探测成功但写库失败」→ 存储层的问题，去查 `/api/health`
- Actions 日志里 `缺少 ANYROUTER_KEY 环境变量` → secret 没配
- Actions 日志里 `回传结果：HTTP 503` → 服务端存储不可用，去查 `/api/health`
- Actions 日志里 `回传结果：HTTP 401` → `INGEST_SECRET` 两边对不上

> ⚠️ **别只看 workflow 的绿勾判断探测有没有效。**
> 脚本只在「回传失败」时才退出非零 —— **探测本身全失败也会显示 success**。
> 必须看日志里的 `汇总：x/y 成功` 那一行。
> （`/api/probe` 没这个问题：它的返回体里直接带着 `succeeded`。）

> ⚠️ **别只看 `schedule` 配置存在就以为定时任务在跑。**
> 2026-09-22 实测：cron 配了、workflow `state=active`、但一个半小时内
> 触发 0 次。要确认得数 run：
>
> ```bash
> curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
>   "https://api.github.com/repos/<owner>/<repo>/actions/runs?event=schedule" \
>   | grep total_count
> ```
>
> 这就是为什么要加 `/api/probe` —— 把触发交给一个说得出话的定时器。

## 数据保留

探测每 5 分钟一轮、每轮 3 条（1 条线路 × 3 个分组），一天约 860 行、一年约 31 万行。
Postgres 扛这个量级没问题（`probes(ts)` 上有索引，页面只查最近 24 小时），
但**目前没有清理策略**。如果哪天觉得表太大，加一条定期删除即可：

```sql
delete from probes where ts < now() - interval '7 days';
```

放哪儿都行：Supabase 的 pg_cron、或者塞进 probe workflow 多跑一步。
页面只用到 24 小时窗口，留 7 天足够排查问题了。

> 线路收敛到 1 条之后，探测目标从 12 个降到 3 个，写入量降到原来的四分之一。
> 以后加回线路，这张账要跟着重算。
