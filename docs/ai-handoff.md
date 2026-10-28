# 把开发交给 WebStorm 里的 AI：提示词交接单

## 为什么要有这个文件

我的运行环境只有命令行：能读写文件、跑构建、抓数据，但**点不了 IDE 界面**，也调不到 Qoder CN 插件登录态背后的模型（它在 `127.0.0.1:30001` 上只认 IDE 内部协议，普通 HTTP 请求直接断开）。

所以分工是：**我负责数据管线、构建验证和收尾；需要成片写代码时，用下面这些提示词在 Qoder 的聊天栏里跑，再把结果交给我验收。**

## 怎么用

1. 在 WebStorm 里打开本项目（`D:\js项目`）。
2. 打开 Qoder CN 聊天栏。
3. 复制下面某一节的「提示词」整段粘贴进去。
4. 拿到代码后直接说「按提示词 1 改完了」，我会跑构建、截图核对、修掉边角问题。
5. 如果 AI 一次改太多，让它**一个一个文件给**，别一次吐五个文件。

## 给 AI 的通用约束（每段提示词都已包含，可复用）

```
项目是 Vite + 原生 JS，没有 React/Vue，不要引入框架。
入口 src/main.js，页面渲染在 src/views.js，组件与格式化在 src/ui.js，样式在 src/styles.css。
数据是静态 JSON，由 scripts/fetch-data.mjs 生成到 public/data/，前端只读，不要改数据 schema 除非明确要求。
DOM 一律用 ui.js 里的 h(tag, props, ...children) 创建，不要用 innerHTML 拼字符串（除 SVG 图表）。
中文文案，风格简洁，不要营销腔。
每次只改一个文件，先给完整文件内容，再给一句话说明改了什么。
```

---

## 提示词 1：错题本（记录错因与题解）

```
在当前项目里加一个「错题本」功能。

目标：每道没过的题可以记一条笔记（错因分类 + 自由文本 + 是否已复盘），保存在浏览器 localStorage，刷新不丢。数据放在 key "algodesk.notes.v1"，结构：
{ "cf:2254A": { reason: "wa", text: "...", reviewed: true, updatedAt: 1790000000000 } }
题目唯一键：CF 用 `cf:${contestId}${index}`，洛谷用 `lg:${pid}`。

要改的文件：
1. src/ui.js：新增 noteStore（读/写/订阅 localStorage），以及题行上的「记一笔」按钮，点击弹出小面板（textarea + 错因下拉：读错题/思路错/边界/超时/不会）。
2. src/views.js：未完成题页面顶部加「只看已复盘 / 只看未复盘」筛选；题行显示错因小标签。
3. src/styles.css：给笔记面板和错因标签加样式，沿用现有 CSS 变量（--panel、--line、--muted 等）。

约束：不要引入依赖；不要动 public/data 的 JSON 结构；笔记读不到时静默降级，不要报错。
验收：npm run build 通过；未完成题页面能记录笔记并筛选；刷新后笔记还在。
```

---

## 提示词 2：接入 AtCoder

```
给 scripts/fetch-data.mjs 增加 AtCoder 数据源，并在前端加一个「AtCoder」标签页。

AtCoder 没有官方 API，用公开页面解析：
- 用户页 https://atcoder.jp/users/{handle}
- 提交记录 https://atcoder.jp/users/{handle}/history/json（公开 JSON，返回每场比赛的 rating 变化）
- 比赛列表 https://atcoder.jp/contests/ （phase 字段）
解析时用正则从 HTML 里取，注意带 User-Agent，请求间隔 800ms，结果写进 .cache/。

产出 public/data/atcoder.json，结构与 cf.json 对齐（upcoming / contests / unsolved 三块能省就省，先只做 contests 与 rating），
然后在 src/views.js 的总览页加一张 AtCoder 卡片，比赛页加一个「AtCoder 即将开始」分组。

约束：抓取失败时要降级成空数组并写一条 warning 到 console，不能让整个 fetch 挂掉。
验收：node scripts/fetch-data.mjs 能跑通并生成 atcoder.json；前端不报错。
```

---

## 提示词 3：主题与移动端

```
给站点加「浅色 / 深色 / 跟随系统」三态主题切换，并修好窄屏布局。

1. src/styles.css：把现有 :root 里的颜色变量抽成 [data-theme="dark"] 和 [data-theme="light"] 两套，
   浅色主题要保证对比度（正文 #1a2230 on #f6f8fb），图表、热力图、徽章的配色一起调。
2. src/main.js：在顶栏右侧加主题按钮，循环切换三态，写 localStorage "algodesk.theme"，
   初始化时读取，没有就用 prefers-color-scheme。
3. 窄屏（<720px）：比赛卡片改单列；题目行只保留「状态点 / 题号 / 题名 / 难度 / 提交」五列；筛选栏横向滚动。

约束：不要引入 CSS 框架；所有颜色都要走变量，禁止在组件里写死色值；切换不能闪白。
验收：npm run build 通过；两种主题下四个页面都正常；375px 宽度下无横向滚动条。
```

---

## 提示词 4：周报生成

```
加一个「本周训练周报」，在总览页底部渲染，纯前端计算，不加后端。

输入：public/data/summary.json 的 heat 数组、cf.json 的 contests 与 unsolved、luogu.json 的 passed。
输出一块卡片，包含：
- 本周提交次数、较上周增减百分比
- 本周结束的比赛场次、净 rating 变化
- 本周新过的题数（用 cf.contests 里 solved 的增量近似即可，取最近 7 天有比赛的场次）
- 一句话结论，按规则拼：提交 < 5 且无比赛 → "这周基本没动"；净变化 > 0 → "在涨"；否则 "在掉"

要改的文件：src/views.js 加 renderWeeklyReport(d)，src/styles.css 加样式。
约束：不要新增依赖；所有数字都要有单位；没有数据时显示「本周还没有记录」而不是 0。
验收：npm run build 通过；总览页底部出现周报卡片，数字与 summary.json 对得上。
```

---

## 交回来之后我会做什么

- 跑 `npm run build` 确认没把构建搞坏
- 用无头浏览器截图对比改前改后，抓布局错位
- 检查有没有把数据 schema 改乱、有没有引入外部依赖
- 有问题直接改，不来回问
