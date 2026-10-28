# 算法训练台 · Algo Desk

[![Deploy](https://github.com/Seas1989/algo-desk/actions/workflows/deploy.yml/badge.svg)](https://github.com/Seas1989/algo-desk/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

线上地址：<https://seas1989.github.io/algo-desk/>

把 **Codeforces** 和 **洛谷** 的账号、比赛、没补完的题放到同一张桌子上——一个纯静态站点，没有后端，没有框架。

不用在 OJ 里翻提交记录，也不用靠记忆找「哪场比赛做了一半」：打开就能看到还欠哪些题、下一场什么时候开、最近几场在涨还是在掉。

![总览](docs/screenshot-home.png)

## 多账号

没有服务器，所以不校验密码，也不假装有。顶栏「登录」做的事是：**在这台浏览器里记下你要看的账号**——一个 CF handle + 一个可选的洛谷 UID，存本机 `localStorage`，可存多个、来回切换、随时移除。handle 和 UID 本来就是公开标识，不存在泄露什么。洛谷 UID 不知道填什么？直接粘整条个人主页链接（`luogu.com.cn/user/<UID>`）就能识别。

**不登录看到什么**：只有首页介绍和「关于」页，任何人的成绩、比赛、题单都不展示，浏览器也不会去请求那些数据 JSON——每一行都是真实成绩，不给围观。AI 教练按钮同样登录后才出现。

三条数据路径（均需先登录/记账号）：

| 数据 | 来源 | 谁能看到 |
| --- | --- | --- |
| Codeforces | 你的浏览器直连官方 API，**实时** | 任何人，输入 handle 即可 |
| 洛谷 · 站主 | 构建时生成 `public/data/luogu.json` 快照 | 登录了站主账号的人 |
| 洛谷 · 其他人 | 构建时生成 `public/data/luogu-<uid>.json` | 只有事先收录进 `config.json` 的人 |

洛谷没有开放接口也没有 CORS，浏览器实时查不了——没被收录的 UID 登录后 CF 部分正常、洛谷部分为空，页面会说明原因。

要收录其他人：把他们写进仓库根目录的 `config.json`，然后重新生成快照：

```json
{
  "cf": "Seas1989",
  "luogu": "1864907",
  "users": [
    { "cf": "Seas1989", "luogu": "1864907", "label": "站主" },
    { "cf": "alice", "luogu": "123456", "label": "Alice" }
  ]
}
```

```bash
npm run fetch:users  # 额外账号快照（luogu-<uid>.json）
npm run fetch:all    # 主账号 + 额外账号一起跑
npm run fetch:plan   # 登录拉你的洛谷做题计划（需先建 luogu-cred.json，见下）
```

拉做题计划前先在本机建 `luogu-cred.json`：`{"username":"你的账号或 UID","password":"你的密码"}`。这个文件已被 gitignore，密码不会进仓库、不会上传到任何第三方；若洛谷触发验证码/设备保护，改从浏览器 F12 复制 `lt` cookie 用 `npm run fetch:plan -- --cookie=lt=xxx`。产出 `public/data/luogu-plan.json`（题号题名和你排的日期，会随站点部署变公开）。

分享链接：`?cf=xxx&lg=xxx` 直接看某人的数据（访客视图会直接切换过去，这是显式分享，不是围观默认态）；`?login=1` 直接弹出登录面板。完整机制（请求细节、边界）见 [docs/multi-user.md](docs/multi-user.md)。

顶栏搜索框按输入内容分流：

| 输入 | 行为 |
| --- | --- |
| 算法标签（中文「贪心」或英文 greedy） | 跳到欠账清单并按该标签筛选 |
| CF handle（3–24 位字母数字） | 实时查询该用户的公开数据，URL 带 `?cf=xxx` 可直接分享 |
| 其他文本 | 按题名 / 题号关键字搜欠账清单 |

## 六个页面各解决什么

**总览**
双平台 rating、过题数与欠账统计，rating 曲线（入场描线动画，悬停节点看「旧分 → 新分」），近 90 天提交热力（悬停格子看当天提交数），当天建议（卡过的题 / 没动的题 / 题单下一步），薄弱算法标签，洛谷难度分布与洛谷比赛记录。
你会看到：一句话的当前状态，和最该先补的三件事。

**比赛**
即将开始的场次带秒级倒计时（CF 与洛谷各一组），点卡片直达比赛页；「我的比赛」逐场列出题目状态（通过 / 提交过但没过 / 没动），半途而废的场次标红；「我的洛谷比赛」列出洛谷 rating 记录；顶部有近 6 场速览。
你会看到：下一场倒计时，以及哪些比赛打穿了、哪些烂尾了。

**未完成题**
三个来源分开统计：比赛未完成、题库练习未过、洛谷未通过，可按难度区间、算法标签、关键字筛选，支持 `#/unsolved?tag=greedy` 这类直达链接。
你会看到：一份能直接照着补的欠账清单。

**做题计划**
从两边欠账自动生成的一周清单：每天 3 题，卡过的优先、薄弱标签加权、难度爬坡。完成/跳过只存本机；跳过会自动补一道同标签、难度接近的题。
**同步你洛谷里的做题计划**：洛谷的计划是私有数据，浏览器里登不了录（没有 CORS，密码也不该进网站）——在你自己电脑上跑一次 `npm run fetch:plan`，脚本用账号密码登录洛谷官方接口把计划拉下来，计划页就会出现「洛谷做题计划」卡片，点一下按你的排期重新铺开，已打勾的题保持完成状态。账号密码只存在本地 `luogu-cred.json`（已 gitignore，绝不提交），只发给 luogu.com.cn 官方域名；也可以改用浏览器里现成的登录态（`--cookie=lt=...`）。
你会看到：今天该做哪三道题，和本周进度、连续打卡。

**题单**
CF 按难度分档、CF 按算法分组、洛谷官方题单完成进度，全部来自你实际没过的题。
你会看到：按顺序能一路做下去的题列表。

**关于**
数据从哪来、这个站怎么认人、怎么更新、免责声明。未登录的访客能看到的两页之一。

![比赛](docs/screenshot-contests.png)

## AI 教练（BYOK）

右下角「AI」按钮打开抽屉：自带 API Key（DeepSeek / 硅基流动 / 通义 / 智谱 / OpenRouter / 自定义），浏览器直连 OpenAI 兼容接口。请求只携带 ≤800 字公开统计摘要（题号题名、标签、比赛名），Key 和数据都留在本机 `localStorage`，不经任何第三方。四个快捷指令：解释这道题 / 给我今天的计划 / 我卡在哪 / 推荐 3 道同类型。

## 每一行都通向提交

题目行与「提交」按钮是并列的原生链接：点行进题面，点「提交」直达提交表单（CF `/contest/{id}/submit`，gym 走 `/gym/{id}/submit`，洛谷题目页自带提交框）。用 `Ctrl` / 中键点击能各自开新标签。

界面细节：路由切换有上浮淡入；所有悬停提示是跟随鼠标的自绘气泡（不是延迟半秒的原生 title）；深浅两套主题下热力格、段位颜色、图表渐变都单独调过；系统开启「减弱动态效果」时动画全部关闭。

## 快速开始

需要 Node 18 以上，零运行时依赖（vite 只在构建期用）。

```bash
npm install
npm run fetch     # 主账号：抓取 CF + 洛谷，写入 public/data/*.json
npm run fetch:users  # config.json 里的额外洛谷账号快照
npm run dev       # 本地预览
npm run build     # 产出 dist/
```

`npm run fetch:refresh` 忽略缓存强制重抓。

换站主（给整个部署换人）：编辑根目录 `config.json` 的 `cf` / `luogu` 字段，或

```bash
node scripts/fetch-data.mjs --cf=你的handle --luogu=你的uid
```

访客想临时看别人：不用碰上面这些，顶栏「登录」记个账号即可。

## 数据从哪来

| 平台 | 方式 | 用到的接口 |
| --- | --- | --- |
| Codeforces | 官方 API | `user.info`、`user.rating`、`user.status`、`contest.list`、`problemset.problems` |
| 洛谷 | 公开页面 | 个人主页、练习情况、官方题单列表与详情、比赛列表 `/contest/list`，解析页面里的 `<script id="lentille-context">` |

只读公开数据，**不保存任何账号密码**。

三处实现细节：

- 洛谷有一条 `C3VK` 反爬 Cookie：脚本先发一次请求拿到 Cookie，再带着 Cookie 重试；所有请求做了限速与本地缓存（`.cache/`），`--refresh` 可强制重抓。
- 判断「是否参加过某场 CF 比赛」不能只看提交记录里有没有 `contestId`（在题库刷题也会带上它）。脚本用的是「有 rating 记录，**或** 提交时间落在该场比赛时段内」。
- 前端实时查 CF 时省掉了上万像素的 `problemset.problems`：题目的 rating / 标签直接从 `user.status` 返回的 `problem` 对象里取。

## 目录结构

```
config.json              站主 handle/UID 与要收录的额外用户（fetch 脚本读取）
scripts/fetch-data.mjs   抓取 + 聚合，产出主账号 JSON
scripts/fetch-luogu-extra.mjs  按 config.json users 抓取额外洛谷快照 luogu-<uid>.json
scripts/fetch-luogu-plan.mjs   登录后拉你的洛谷做题计划（凭据只存本机 luogu-cred.json）
src/main.js              hash 路由、主题切换、顶栏搜索分发、账号应用、启动
src/views.js             页面渲染入口（统一导出）
src/plan.js              做题计划：生成排序、localStorage 进度、导入
src/accounts.js          本地多账号：增删切换（存 localStorage，无密码）
src/login.js             账号面板（登录弹窗、顶栏账号按钮）
src/guest.js             访客视图（未登录时的首页介绍与登录引导，不加载任何数据）
src/account.css          账号面板样式
src/ui.js                DOM 助手、格式化、悬停提示气泡、公共组件
src/i18n.js              算法标签 / 段位 / 评测结果的中文映射
src/ai-context.js        把账号数据压成 ≤800 字纯文本给 AI
src/ai.js                AI 教练抽屉（BYOK，按需加载）
src/live.js              浏览器直连 CF API 的实时查询（按需加载）
src/styles.css           全部样式（含深浅两套主题变量，无 CSS 框架）
public/data/*.json       生成好的数据，随仓库提交，克隆即可跑
docs/                    截图、交接文档与 multi-user.md（多账号机制）
```

## 部署到 GitHub Pages

1. 推到 GitHub，默认分支设为 `main`
2. 仓库 Settings → Pages → Build and deployment 的 **Source 选 GitHub Actions**
3. `.github/workflows/deploy.yml` 会在推送、每天定时（UTC 22:00）、手动触发时构建并发布

因为 `vite.config.js` 里用了 `base: './'`，产物放在 `/<repo>/` 子路径下也能正常加载，无需改配置。

定时任务里抓取失败不会中断部署（`continue-on-error`），会回退到仓库里的旧数据，所以站点不会因为洛谷临时抽风而打不开。

## 主题

顶栏右侧按钮循环切换「深色 / 浅色 / 跟随系统」，选择记在 `localStorage["algodesk.theme"]`。`index.html` 里有一段早于样式执行的内联脚本，刷新时先定好 `data-theme`，避免闪白。

## 已知限制

- **洛谷个人题单没有公开接口**，只能读官方题单，因此题单页只覆盖官方题单。
- **洛谷个人做题计划是私有数据，没有公开接口**：要同步用 `npm run fetch:plan` 在本机登录抓取（密码只存本地 gitignore 文件），或逐题粘贴到计划页的导入框；拉下来的计划 JSON 会随站点公开。
- **洛谷报名必须在洛谷站内完成**（依赖你自己的登录态），本站只做跳转，不代报名；洛谷也没有开放 API 与 CORS，无法像 CF 那样实时查询。
- **账号存在本机**：换设备 / 换浏览器要重新加一次（`localStorage`，不跨设备同步）；未收录的洛谷 UID 登录后没有洛谷数据。
- **登录后才出数据**：未登录只渲染首页介绍与「关于」页，站主的数据也不会默认展示；想要站主视图的部署（比如给队伍用）需要访问者自行登录站主 handle。
- 大型 ICPC / gym / 特殊赛的题目不在 `problemset.problems` 里，这类场次只显示已过题数，不给分母。
- CF `contest.type` 字段不可靠（Div.3 也可能标成 `ICPC`），判断题目集是否完整改用题目数量。
- 洛谷页面结构更新时，`scripts/fetch-data.mjs` 里的解析可能要跟着改。
- AI 教练是 BYOK：不填 Key 不请求；接口可用性取决于你填写的服务商，本站不代理、不存储任何请求内容。
- 非官方工具，与 Codeforces、洛谷无关联。

## 路线图

- 本地多账号已落地；跨设备同步与队伍模式需要后端，暂无计划内实现
- 错题本：记录错因与题解（localStorage）
- 接入 AtCoder

## License

MIT
