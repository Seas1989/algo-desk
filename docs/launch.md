# 怎么让别人看到这个项目

Star 不是靠代码自动来的。一个陌生人从点进仓库到按下 star，只经历三秒判断：
**这东西跟我有关吗 / 我能不能马上用 / 作者是不是认真做的**。
下面按这三条排，不用一次全做完。

---

## 已就绪的（不用再动）

- 线上地址：<https://seas1989.github.io/algo-desk/>，打开就能用
- 首页可以直接输 CF handle 立刻看自己的战绩，**不用注册**
- README 有截图、有数据来源说明、有已知限制
- 仓库 topics：codeforces、luogu、competitive-programming、dashboard…

## 还差一步（手动一分钟）

**Social Preview**：GitHub 仓库 Settings → 最下面 Social preview → 上传 `docs/screenshot-home.png`。
分享到聊天软件、微博、Discord 时就是这张图，比默认的灰块点击率高得多。API 设不了，只能手点。

**打个 tag**：`git tag v0.1.0 && git push --tags`。仓库有版本号，别人会觉得你在维护，而不是随手扔的。

---

## 发帖文案（改一改就能用）

### V2EX / 掘金 / 少数派

> **做了个把 Codeforces 和洛谷放一起的训练台**
>
> 每次打完比赛，欠的题散在两个站的提交记录里，靠记忆记不住哪场做了一半。所以写了个纯静态的看板：
>
> - 比赛页列出即将开始的场次（带倒计时）和打过的每一场，逐题标出过没过
> - 欠账的题按难度和算法分开，点一行直接进提交页
> - 洛谷题单带完成进度，下一步该做哪题也标出来
> - 训练页可以让自己的 AI 按「这周只练 dp、每天 2 题」这种要求排计划
>
> 没有后端，数据要么走官方公开接口，要么在构建时预生成。填个 handle 就能看自己的：
> <https://seas1989.github.io/algo-desk/>
> 源码：<https://github.com/Seas1989/algo-desk>
>
> 洛谷没有开放接口，所以洛谷部分要先在 `config.json` 里登记 UID 再构建；CF 是实时的。
> 用着有用就给颗星，有 bug 直接提 issue。

### 洛谷讨论区（注意版规，别刷屏）

> 分享一个自己写的 CF + 洛谷训练看板，纯前端、开源。
> 主要解决两件事：①比赛没做完的题容易忘；②题单进度得一个个点开看。
> 洛谷部分需要在本地构建时抓一次数据（脚本在仓库里，只读公开页面）。
> 链接：… 觉得有用欢迎 star，也欢迎提需求。

### Reddit r/codeforces · r/competitiveprogramming（英文）

> **Built a dashboard that tracks what you still owe from contests**
>
> I kept losing track of which problems I left unsolved across Codeforces rounds — submissions are scattered, and the "unsolved" list isn't a thing. So I built a static dashboard:
>
> - upcoming contests with countdown; past contests broken down problem by problem
> - unsolved problems grouped by rating and by tag, one click to the submit page
> - training-plan page where you can ask an LLM (bring your own key) to schedule the week
>
> No backend — Codeforces data comes straight from the public API in your browser.
> Live: … · Source: …
> Feedback welcome, especially from people who solve more than I do.

---

## 顺序建议

1. 先补 Social Preview + tag（十分钟，影响每一次分享）
2. 发 **一个** 中文社区（V2EX 分享创造最合适），看反馈再决定发不发第二个
3. 有人提 issue 就必须回——报 issue 的人是最可能给你 star 的人
4. 攒到十几颗星再发英文社区，冷启动时太冷清反而没人点

## 不要做的

- 买 star、互 star 群：GitHub 会清洗，掉了很难看，而且对真实用户零帮助
- 一天内在五个社区群发：会被当广告
- 把 README 写成营销稿：算法圈子对「颠覆」「赋能」极度敏感，写清楚能干什么就行
