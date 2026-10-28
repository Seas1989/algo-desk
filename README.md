# 算法训练台 · Algo Desk

把 **Codeforces** 和 **洛谷** 的账号、比赛、欠账的题放到一张桌子上。

不用在 OJ 里点来点去翻自己的提交记录，也不用靠记忆找出「哪场比赛我做了一半」——打开一页就能看到：还有什么题没补、下一场什么时候开、最近几场在涨还是在掉。

## 功能

**总览**
双平台 rating 与过题数、欠账统计、rating 曲线、近 90 天提交热力、当天建议（卡过的题 / 没动的题 / 题单下一步）、薄弱算法标签。

**比赛**
即将开始的场次带秒级倒计时，点卡片直达报名页；「我的比赛」逐场列出题目状态（通过 / 提交过但没过 / 没动），半途而废的场次直接标红；顶部有近 6 场速览。

**未完成题**
三个来源分开统计：比赛未完成、题库练习未过、洛谷未通过。可按难度区间、算法标签、关键字筛选。

**题单**
CF 按难度分档、CF 按算法分组、洛谷官方题单完成进度，全部来自你实际没过的题。

**每一行都通向提交**
点行 → 进题面；点「提交」→ 直接进提交表单（CF `/contest/{id}/submit`，洛谷题目页自带提交框）。

## 快速开始

需要 Node 18 以上。

```bash
npm install
npm run fetch     # 抓取 CF + 洛谷，写入 public/data/*.json
npm run dev       # 本地预览
npm run build     # 产出 dist/
```

`npm run fetch --refresh` 忽略缓存强制重抓。

修改账号：编辑 `scripts/fetch-data.mjs` 里的 `CF_HANDLE` / `LUOGU_UID`，或

```bash
node scripts/fetch-data.mjs --cf=你的handle --luogu=你的uid
```

## 数据从哪来

| 平台 | 方式 | 用到的接口 |
| --- | --- | --- |
| Codeforces | 官方 API | `user.info`、`user.rating`、`user.status`、`contest.list`、`problemset.problems` |
| 洛谷 | 公开页面 | 个人主页、练习情况、题单列表与详情，解析页面里的 `lentille-context` |

两点实现细节值得记一下：

- 洛谷有一条 `C3VK` 反爬 Cookie，脚本先拿 Cookie 再重试，并对所有请求做了 500ms 间隔与本地缓存。
- 判断「是否参加过某场比赛」不能只看提交记录里有没有 `contestId`——在题库刷题也会带上它。脚本用的是「有 rating 记录，或提交时间落在该场比赛时段内」。

只读公开数据，**不登录、不保存任何账号密码**。

## 目录结构

```
scripts/fetch-data.mjs   抓取 + 聚合，产出三个 JSON
src/main.js              hash 路由与启动
src/views.js             五个页面的渲染
src/ui.js                DOM 助手、格式化、公共组件
src/styles.css           全部样式（无 CSS 框架）
public/data/*.json       生成好的数据，随仓库提交，克隆即可跑
```

## 部署到 GitHub Pages

1. 推到 GitHub，默认分支设为 `main`
2. 仓库 Settings → Pages → Source 选 **GitHub Actions**
3. `.github/workflows/deploy.yml` 会在推送、每天定时、手动触发时构建并发布

因为 `vite.config.js` 里用了 `base: './'`，产物放在 `/<repo>/` 子路径下也能正常加载，无需改配置。

定时任务里抓取失败不会中断部署（回退到仓库里的旧数据），所以站点不会因为洛谷临时抽风而挂掉。

## 已知限制

- 洛谷页面结构更新时，`scripts/fetch-data.mjs` 里的解析可能要跟着改。
- CF `contest.type` 字段不可靠（Div.3 也会标成 `ICPC`），判断题目集是否完整改用题目数量。
- 大型 ICPC / 特殊赛的题目不在 `problemset.problems` 里，这类场次只显示已过题数，不给分母。
- 非官方工具，与 Codeforces、洛谷无关联。

## License

MIT
