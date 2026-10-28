# 第二轮：交互修复 + 主题切换

把下面整段粘进 Qoder 的输入框。等当前这一轮跑完再贴，免得两个任务改同一批文件。

---

请修三个问题，都是交互层面的。**不要动 `scripts/fetch-data.mjs`，不要改 `public/data/*.json` 的结构。**

## 1. 题目行的跳转（`src/ui.js` 的 `probRow`）

现在的结构是 `<a class="prob">` 里面又套了 `<a class="mini-btn">提交</a>`。嵌套 `<a>` 是非法 HTML，浏览器解析时会把它拆成兄弟节点，导致点行跳错地方、点「提交」有时没反应、hover 高亮错位。

改成兄弟结构，保住原生链接能力（中键 / Ctrl 点击仍能开新标签）：

```html
<div class="prob-row">
  <a class="prob" href="题面地址" target="_blank" rel="noreferrer">…原有内容…</a>
  <a class="mini-btn" href="提交地址" target="_blank" rel="noreferrer">提交</a>
</div>
```

`display: grid` 那套列宽改挂到 `.prob-row` 上，最后一列留给按钮；`.prob` 自身改成 `display: contents` 或直接去网格化，保证列对齐不变。

提交地址规则：

- 普通比赛：`https://codeforces.com/contest/{contestId}/submit`
- gym（`contestId >= 100000`）：`https://codeforces.com/gym/{contestId}/submit`
- 洛谷：题目页本身就是提交入口，`https://www.luogu.com.cn/problem/{pid}`

## 2. 比赛卡片的点击（`src/views.js` 的 `contestCard`）

`<summary>` 里放了指向比赛页的 `<a>`，两者抢点击：点标题有时展开、有时跳转，行为不稳定。

- `<summary>` 只负责展开 / 收起
- 比赛名保留 `<a>`，但要加 `onClick: (e) => e.stopPropagation()`
- 卡片右侧固定一个「去比赛 ↗」按钮，始终可点
- 展开后第一行给一句操作提示：点题目进题面，点「提交」直达提交表单

## 3. 主题切换（深 / 浅 / 跟随系统）

所有颜色已经在 `src/styles.css` 的 `:root` 里，拆成两套：

```css
:root[data-theme='dark']  { --bg: #0a0e14; … }
:root[data-theme='light'] { --bg: #f6f8fb; --panel: #ffffff; --text: #1a2230; --muted: #5b6b82; … }
```

- `src/main.js` 顶栏加一个循环切换按钮，写 `localStorage['algodesk.theme']`
- **必须防闪白**：在 `index.html` 的 `<head>` 里放一段内联脚本，在样式表加载前就把 `data-theme` 打到 `<html>` 上
- 浅色下热力图、rating 徽章、进度条、图表都要跟着换，不能出现深底浅字或反过来的死色值

## 验收

- `npm run build` 通过
- 四个页面在两种主题下都正常，刷新不闪白
- 375px 宽度下没有横向滚动条
- 点题目行任意位置进题面；点「提交」直达提交表单；Ctrl / 中键点击能开新标签
- 比赛卡片：点标题只展开，点「去比赛」只跳转，两者不互相触发
