# 多账号：谁能看谁的数据

这个站部署在 GitHub Pages 上，**没有后端**。所以「登录」不做密码，也不假装有——
一个账号就是「一个 CF handle + 一个洛谷 UID」，存在访客自己的浏览器里，用来决定拉谁的数据。

## 为什么不能做真登录

- 没有服务器能校验密码；把密码存在 localStorage 里既不安全也没有意义
- 洛谷没有开放接口，也没有 CORS；浏览器直接请求会被拦
- Codeforces 允许跨域，所以 **CF 可以实时拉**，洛谷只能读构建时写好的 JSON

## 三条数据路径

| 数据 | 来源 | 谁能看 |
| --- | --- | --- |
| Codeforces | 浏览器直连 `codeforces.com/api`，实时 | 任何人，输入 handle 即可 |
| 洛谷 · 站主 | 构建时生成 `public/data/luogu.json` | 所有人（默认视图） |
| 洛谷 · 其他人 | 构建时生成 `public/data/luogu-<uid>.json` | 只有被收录进 `config.json` 的人 |

## 用法

**访客**：点顶栏「登录」，填 CF handle（必填）+ 洛谷 UID（选填）。账号记在本机，
下次打开自动恢复。也可以直接分享链接：

```
https://<站点>/?cf=<handle>&lg=<uid>    # 直接看某人的数据
https://<站点>/?login=1                 # 直接弹出登录面板
```

**站主**：把想收录的人写进 `config.json`，然后重新生成快照：

```json
{
  "cf": "<站主的 handle>",
  "luogu": "<站主的 UID>",
  "users": [
    { "cf": "<handle>", "luogu": "<uid>", "label": "站主" },
    { "cf": "<另一个 handle>", "luogu": "<另一个 uid>", "label": "可选备注" }
  ]
}
```

```bash
npm run fetch        # 主账号（产出 luogu.json）
npm run fetch:users  # 额外账号（产出 luogu-<uid>.json）
npm run fetch:all    # 两个一起跑
```

`fetch:users` 每个用户只发两个请求（个人主页 + 练习情况），题单结构复用站主那份 ——
题单对所有人是同一批题，只有「过没过」因人而异，没必要给每个人重抓 18 个题单详情。

## 边界（写清楚，免得期待落空）

- 没被收录的洛谷 UID：登录后 CF 部分正常，洛谷部分为空，顶部提示条会说明原因
- 换设备要重新加账号（存在 localStorage，不跨设备同步）
- 私有数据（洛谷的做题计划、题单收藏）拿不到，只有公开的通过/未通过列表
- 数据是构建时的快照，不是实时的；站主更新网站的定时任务会顺带刷新
