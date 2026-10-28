/**
 * ai-context.js — 把账号数据压成 ≤800 字纯文本，供 AI 教练使用。
 * 只含公开统计、题号题名、标签、比赛名；不含 Cookie、密码。
 */
import { tagCN, rankCN } from './i18n.js';
import { getProb } from './ui.js';
import { planStatus } from './plan.js';

export function buildContext(data) {
  const s = data?.summary;
  const cf = data?.cf;
  if (!s || !cf) return '（数据未加载）';
  const lines = [];

  lines.push(`用户 ${s.cf.handle}，CF rating ${s.cf.rating}（峰值 ${s.cf.maxRating}·${rankCN(s.cf.maxRank)}），已过题 ${s.cf.solved}。`);
  lines.push(`欠账：CF 比赛未完成 ${s.cf.unfinished} 题，练习场未过 ${s.cf.practiceUnsolved}，洛谷已提交未过 ${s.luogu.submitted}。`);

  const weak = (s.weakTags || []).slice(0, 8).map((t) => `${tagCN(t.tag)}${t.missing}`).join('、');
  if (weak) lines.push(`薄弱标签（未过数）：${weak}。`);

  const cur = getProb();
  if (cur)
    lines.push(
      `当前正在看的题：${cur.contestId ?? ''}${cur.index ?? cur.pid ?? ''}《${cur.name}》，rating ${cur.rating ?? '—'}，标签 ${(cur.tags || []).slice(0, 3).map(tagCN).join('、')}。`,
    );

  const recent = (cf.contests || [])
    .slice(0, 5)
    .map((c) => `${c.name}${c.delta != null ? ` ${c.delta > 0 ? '+' : ''}${c.delta}` : ''}`)
    .join('；');
  if (recent) lines.push(`最近 5 场：${recent}。`);

  const easy = [...(cf.unsolved || [])]
    .sort((a, b) => (a.rating ?? 9999) - (b.rating ?? 9999))
    .slice(0, 15)
    .map((p) => `${p.contestId}${p.index}《${p.name}》${p.rating ?? ''}`)
    .join('；');
  if (easy) lines.push(`最低难度 15 道未完成：${easy}。`);

  lines.push(planStatus(data));

  return lines.join('\n').slice(0, 800);
}
