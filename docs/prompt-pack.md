# 提示词包（按顺序粘，一条只做一件事）

用法：在 Qoder 输入框里**一次只粘一条**，等它写完、`npm run build` 过了，再粘下一条。
顺序是按「改动范围小 → 大」排的，前面两条不碰数据，后面两条才碰。

通用的底线，每条都重复了：项目是 Vite + 原生 JS，不要引入框架；DOM 一律用 `src/ui.js` 的 `h()` 创建；`npm run build` 必须通过。

---

## 提示词 1｜题目与比赛的跳转

```
只改交互，不碰数据。

【问题】src/ui.js 的 probRow 现在把 <a class="mini-btn">提交</a> 套在
<a class="prob"> 里面。嵌套 <a> 是非法 HTML，浏览器解析时会拆成兄弟节点，
导致点行跳错地方、点「提交」有时没反应、hover 高亮错位。

【改法】改成兄弟结构，保住原生链接能力（中键 / Ctrl 点击仍能开新标签）：

<div class="prob-row">
  <a class="prob" href="题面地址" target="_blank" rel="noreferrer">…原有内容…</a>
  <a class="mini-btn" href="提交地址" target="_blank" rel="noreferrer">提交</a>
</div>

- display:grid 的列宽改挂到 .prob-row，最后一列留给按钮
- .prob 自身改成 display:contents，保证列对齐和现在一致
- 响应式断点里的 grid-template-columns 一并迁到 .prob-row

提交地址规则：
- 普通比赛 https://codeforces.com/contest/{contestId}/submit
- gym（contestId >= 100000）https://codeforces.com/gym/{contestId}/submit
- 洛谷：题目页本身就是提交入口，直接用题目链接

【第二个问题】src/views.js 的 contestCard 用 <details>/<summary> 做折叠，
但 <summary> 里又放了指向比赛页的 <a>，两个可点击区域重叠，点标题有时展开
有时跳转。

- <summary> 只负责展开/收起
- 比赛名的 <a> 加 onClick: (e) => e.stopPropagation()
- 卡片右侧固定加一个「去比赛 ↗」按钮，始终可点
- 展开后第一行加一句提示：点题目进题面，点「提交」直达提交表单

【验收】npm run build 通过；点题目行任意位置进题面，点「提交」直达提交表单，
Ctrl/中键能开新标签；比赛卡片点标题只展开，点「去比赛」只跳转。
```

---

## 提示词 2｜主题切换

```
加「深色 / 浅色 / 跟随系统」三态主题。

【改法】
1. src/styles.css 里 :root 的颜色变量本来是一套，拆成：
   :root[data-theme='dark']  { …现有值… }
   :root[data-theme='light'] { --bg:#f6f8fb; --panel:#ffffff; --panel2:#f0f3f8;
                               --line:#dde3ec; --line2:#c8d2e0; --text:#1a2230;
                               --muted:#5b6b82; --dim:#8a97a8; --accent:#1f6feb }
   两套都要把热力图 lv0~lv4、rating 徽章的 gray/green/cyan/blue/purple/orange/red、
   洛谷难度 lg1~lg7、进度条、图表渐变调整到在该主题下看得清。

2. index.html 的 <head> 里加一段内联脚本（必须早于样式表）：
   读 localStorage['algodesk.theme']，没有就按 matchMedia('(prefers-color-scheme: light)')
   决定，把 data-theme 打到 document.documentElement 上。目的是刷新不闪白。

3. src/main.js 顶栏右侧加一个按钮，显示「深色/浅色/跟随系统」，循环切换，
   切换时同时写 localStorage 和 <html data-theme>。

【约束】禁止在组件里写死色值，全部走变量；不要引入依赖。
【验收】npm run build 通过；四个页面两种主题都正常；刷新不闪白；
375px 宽度无横向滚动条。
```

---

## 提示词 3｜汉化

```
把界面里的英文元数据翻成中文。src/i18n.js 里已经写好完整的映射表
（TAG_CN 算法标签、RANK_CN 段位、VERDICT_CN 评测结果），但没有被任何地方引用。

【改法】
1. src/ui.js 的 probRow：标签 chip 用 tagCN(t)；评测结果 chip 用 verdictCN(v)，
   并把 VERDICT_FULL 里的完整说法放到 title 属性上（悬停能看到「答案错误」）。
2. src/views.js：段位显示用 rankCN(...)——总览页 statCard 的副标题里
   「最高 1426 · specialist」要变成「最高 1426 · 专家」；profile 卡片同理。
3. 未完成题页的「全部算法」下拉：显示中文，但 value 仍保留英文 key，
   否则筛选逻辑会失效。
4. 题单页的算法分组标题用中文，里面的题目标签也用中文。

【约束】映射表已存在，不要重写或删减；查不到的标签原样显示，不能变成空白。
【验收】npm run build 通过；页面上看不到 greedy/dp/binary search/WA/TLE 这类英文，
筛选功能照旧可用。
```

---

## 提示词 4｜洛谷适配：比赛与统计

```
给洛谷补齐「比赛」和「统计」两块。这一条会改抓取脚本，注意别动 CF 的部分。

【抓取】scripts/fetch-data.mjs
1. 复用文件里已有的 luoguGet()（它已经处理了 C3VK 反爬 cookie 和限速），
   新增一个路由 /contest/list，结果缓存 1 小时。
   返回结构：ctx.data.contests = { count, perPage, result: [...] }，
   单条字段：id, startTime, endTime, name, rated, host.name, problemCount。
2. 从 result 里筛 startTime > 现在 的，取最近 6 场，写进 luogu.json：
   contests.upcoming = [{ id, name, startTime, endTime, host, problemCount,
                          url: 'https://www.luogu.com.cn/contest/' + id }]
3. 统计：用 lgPractice.data.passed 里每道题的 difficulty（1~7）统计各档题数，
   写进 luogu.json：stats.byDifficulty = [{ d: 1, count: 62 }, …]
4. 已有的 elo 数组保留，那是洛谷自己的 rating 变化记录。

【前端】
5. 比赛页（src/views.js 的 contests）：在 CF 的「即将开始」下面加一块
   「洛谷 · 即将开始」，卡片样式复用 .upcoming，倒计时复用 data-countdown，
   点击整张卡打开洛谷比赛页（报名在他自己的浏览器登录态里完成，页面只负责跳转）。
6. 同一页加一块「我的洛谷比赛」，用 luogu.json 的 elo 渲染：比赛名、rating、时间。
7. 总览页加一张「洛谷难度分布」卡片：7 行横条，标签用 入门/普及-/普及提高-/普及+/
   提高+/省选-/NOI，数值是该档已通过题数。

【约束】CF 相关逻辑一行都不要改；抓取失败要降级成空数组，不能整个 fetch 挂掉。
【验收】node scripts/fetch-data.mjs 跑通并生成新的 luogu.json；
npm run build 通过；比赛页和总览页能看到洛谷的数据。
```

---

## 提示词 5｜README 详细版

```
重写 README.md，面向第一次见到这个仓库的人。要详细，但不要空话。

必须包含：
1. 一句话定位 + 线上地址 + 徽章（已有）
2. 截图占位：docs/screenshot-home.png、docs/screenshot-contests.png
   （先写 <img> 标签，路径留好，我之后补图）
3. 功能详解：五个页面各自解决什么问题，配一句「你会看到什么」
4. 快速开始：Node 18+、npm install、npm run fetch、npm run dev、npm run build
5. 数据来源表：CF 官方 API 用了哪几个端点；洛谷读的是公开页面，解析
   <script id="lentille-context"> 里的 JSON，并说明了 C3VK cookie 的处理
6. 换账号：修改 scripts/fetch-data.mjs 顶部默认值，或用 --cf=xxx --luogu=uid
7. 目录结构与每个文件的职责（scripts/、src/、public/data/）
8. 部署到 GitHub Pages 的完整步骤（含 Settings → Pages → GitHub Actions）
9. 已知限制，如实写：
   - 洛谷个人题单（用户自己创建的）没有公开接口，只支持官方题单
   - 洛谷比赛报名必须在洛谷站内完成，本站只做跳转
   - 大型 ICPC 场次题目不全，只显示已过题数
   - CF contest.type 字段不可靠，判断题目集用题目数量
10. 路线图：多账号登录、错题本、AtCoder 接入
11. MIT License

【约束】不要编造不存在的功能；不要写「简单易用」「功能强大」这类词。
【验收】README 里每条命令都能照着跑通。
```

---

## 提示词 6｜选做：按账号看自己的数据

这条会改架构，前五条都稳定了再做。

```
让任何访客能输入自己的 Codeforces handle 看自己的数据，不需要后端。

【做不动的地方先承认】洛谷没有开放接口也没有 CORS，静态站点无法直接查别人，
所以洛谷部分继续用仓库里预生成的 JSON。

【改法】
1. src/main.js 顶栏加一个输入框 + 「查看」按钮。输入 handle 后：
   - 前端直接 fetch https://codeforces.com/api/user.info?handles={handle}
     和 user.status，CF 允许跨域
   - 拿到的数据走和 cf.json 相同的字段结构，交给同一套 views 渲染
   - handle 写进 URL 的 ?cf=xxx，刷新不丢
2. 没有 ?cf 参数时，回退到 public/data 里的默认数据（也就是现在这套）
3. 请求失败（handle 不存在 / 被限频）给一条中文提示，不要白屏
4. 在输入框旁边写清楚：只支持自己查自己，数据来自 CF 公开 API

【约束】不要引入依赖；不要引入后端；洛谷数据保持静态。
【验收】npm run build 通过；输入 Seas1989 能看到和现在一样的数据；
输入一个不存在的 handle 有明确报错。
```
