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

打开 `https://<你的域名>/api/status`，看返回 JSON 里的 `source` 字段：

- `"source":"db"` → **成功**，探测数据和用户上报都是真的
- `"source":"demo"` → 数据库没连上，页面顶部会显示「当前展示示例数据」

还是 `demo` 的话，去 Vercel 的 Functions 日志看 `[db] query failed:` 后面的原因。

> **为什么本机测不出来**：这台机器的 Clash 开了 fake-IP + TUN，会把 `*.supabase.co`
> 解析成 `28.0.0.x` 假地址，本地连不上池化器（详见 README 的「本项目的 Supabase 配置」）。
> Vercel 上没有这层代理，那里才是真实环境。

---

## 已经替你做完的

- ✅ `git init` + 46 个文件已提交；`.env.local` / `_tools/` 已忽略，**密钥没进仓库**
- ✅ `.gitattributes` 统一换行符（Windows 开发 / Linux 构建）
- ✅ `npm run build` 用 Vercel 完全相同的命令跑通
- ✅ Supabase 6 张表已建好，RLS 已开
- ⚠️ git 提交身份目前是占位的（`anyrouter-watch dev <dev@anyrouter-watch.local>`）。
  想换成你自己的：

  ```bash
  git config user.name "你的名字"
  git config user.email "你的邮箱"
  git commit --amend --reset-author --no-edit
  ```

---

## 需要你提供的

只有一样：**GitHub 仓库地址**。给我之后，推送、环境变量、Actions secrets 我都能接着做完。

或者你说一声走路线 B，那你只需要点一次 Vercel 登录授权。
