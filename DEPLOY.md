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
| `INGEST_SECRET` | 与 `.env.local` 里一致 | 探测回传接口的鉴权口令 |

两个都要加到 **Production / Preview / Development** 三个环境。

### 4. 打开定时探测

仓库 Settings → Secrets and variables → Actions，加：

| Secret | 值 |
|---|---|
| `ANYROUTER_KEY` | 你自己的 AnyRouter key（探测会消耗额度） |
| `INGEST_URL` | `https://<你的域名>/api/ingest` |
| `INGEST_SECRET` | 与 Vercel 上一致 |

然后 Actions → probe → Run workflow 手动跑一次，确认回传成功。

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
- ✅ Vercel 环境变量 `DATABASE_URL` / `INGEST_SECRET` 已写入（production / preview / development）
- ✅ Supabase 6 张表已建好，RLS 已开；线上 `/api/health` 返回「数据库连接正常」
- ✅ GitHub Actions secrets 已写入 `INGEST_URL` / `INGEST_SECRET` / `ANYROUTER_KEY`
- ✅ **线上探测已跑通**：12 个目标全部回传成功，`/api/status` 返回 `source=db`
- ✅ 探测配置已按实测校正（分组走对应端点、模型名换成真实存在的、删除不存在的国产分组）
- ✅ 端到端验证过：`/api/ingest` 写入 → `/api/status` 读出 `source=db`（验证用的合成数据已删除）
- ✅ 讨论区已可用，站长的欢迎帖已发出
- ✅ `.gitattributes` 统一换行符（Windows 开发 / Linux 构建）
- ✅ `npm run build` 用 Vercel 完全相同的命令跑通
- ✅ `.env.local` / `_tools/` 已忽略，**密钥没进仓库**

**还没做的：**

- ⚠️ **线路清单待核实**。实测下来 4 条线路里只有「主站直连」真的在提供服务：
  - 大陆优化 A → `404 page not found`（该地址不提供 `/v1`）
  - 大陆优化 B → `403 Current user is in debt`（节点账号欠费）
  - CDN 备用 → 连不上

  这几条地址最初是从社区帖子抄的，需要确认是否还有效。
  改 `lib/config.ts` 里的 `ROUTES` 和 `scripts/probe.mjs` 里的 `ROUTES`（两处要一致）。

- ⚠️ git 提交身份目前是占位的（`anyrouter-watch dev <dev@anyrouter-watch.local>`）。
  想换成你自己的：

  ```bash
  git config user.name "你的名字"
  git config user.email "你的邮箱"
  git commit --amend --reset-author --no-edit
  ```

- ⚠️ 本次用到的 GitHub PAT 和 Vercel token 都出现在对话记录里了，**用完请吊销**。

---

## 怎么自己触发一次探测

不用等定时任务，去 GitHub 仓库的 **Actions → probe → Run workflow** 手动跑一次。
跑完刷新 `/api/status`，`source` 应该变成 `db`。

如果失败，先在 Actions 日志里看是哪一步：
- `缺少 ANYROUTER_KEY 环境变量` → secret 没配
- `回传结果：HTTP 503` → 服务端存储不可用，去查 `/api/health`
- `回传结果：HTTP 401` → `INGEST_SECRET` 两边对不上
