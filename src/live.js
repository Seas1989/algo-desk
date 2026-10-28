/**
 * live.js — 浏览器直连 Codeforces 公开 API，聚合出与 cf.json / summary.cf 同构的数据。
 * 只查 Codeforces（允许跨域）；洛谷无开放接口与 CORS，不支持实时查询。
 * 为省掉上万像素的 problemset.problems，题目的 rating/tags 直接取自 user.status 里的 problem 对象。
 */
import { h } from './ui.js';

const CF_API = 'https://codeforces.com/api';

async function get(method, params) {
  const res = await fetch(`${CF_API}/${method}?${new URLSearchParams(params)}`);
  let j;
  try {
    j = await res.json();
  } catch {
    throw new Error('Codeforces 接口返回异常');
  }
  if (j.status !== 'OK') {
    const c = j.comment || '';
    const who = params.handle || params.handles || '';
    if (/between 3 and 24/i.test(c)) throw new Error(`handle「${who}」长度需为 3–24 个字符`);
    if (/not found/i.test(c)) throw new Error(`找不到用户「${who}」`);
    throw new Error(c || `Codeforces ${method} 失败`);
  }
  return j.result;
}

const problemUrl = (cid, idx) => `https://codeforces.com/${cid >= 100000 ? 'gym' : 'contest'}/${cid}/problem/${idx}`;
const BUCKETS = [
  [0, 1000, '800–1000 入门'],
  [1001, 1300, '1100–1300 普及-'],
  [1301, 1500, '1301–1500 普及/提高-'],
  [1501, 1700, '1501–1700 提高'],
  [1701, 1900, '1701–1900 提高+'],
  [1901, 2100, '1901–2100 省选-'],
  [2101, 9999, '2101+ 省选+'],
];
const cmp = (a, b) => (a.rating ?? 9999) - (b.rating ?? 9999) || b.tries - a.tries;

export async function fetchCfLive(handle) {
  const [info, rating, subs, cList] = await Promise.all([
    get('user.info', { handles: handle }),
    get('user.rating', { handle }),
    get('user.status', { handle, count: 5000 }),
    get('contest.list', { gym: 'false' }),
  ]);
  const u = info[0];
  if (!u) throw new Error(`找不到用户 ${handle}`);
  const nowSec = Date.now() / 1000;
  const meta = new Map(cList.map((c) => [c.id, c]));

  // 逐题聚合
  const byProb = new Map();
  const contestIdx = new Map();
  for (const s of subs) {
    const p = s.problem;
    if (!p) continue;
    const key = `${p.contestId}${p.index}`;
    let rec = byProb.get(key);
    if (!rec) {
      rec = { contestId: p.contestId, index: p.index, name: p.name, rating: p.rating ?? null, tags: p.tags || [], tries: 0, lastVerdict: '', lastAt: 0, solved: false };
      byProb.set(key, rec);
    }
    rec.tries++;
    if (s.creationTimeSeconds >= rec.lastAt) {
      rec.lastAt = s.creationTimeSeconds;
      rec.lastVerdict = s.verdict;
    }
    if (s.verdict === 'OK') rec.solved = true;
    if (!contestIdx.has(p.contestId)) contestIdx.set(p.contestId, new Map());
    contestIdx.get(p.contestId).set(p.index, rec);
  }

  // 参赛判定：有 rating 记录，或提交落在比赛时段内
  const participated = new Set(rating.map((r) => r.contestId));
  for (const s of subs) {
    const cid = s.problem?.contestId;
    const m = cid && meta.get(cid);
    if (m && s.creationTimeSeconds >= m.startTimeSeconds && s.creationTimeSeconds <= m.startTimeSeconds + m.durationSeconds) participated.add(cid);
  }
  const ratingBy = new Map(rating.map((r) => [r.contestId, r]));

  const contests = [];
  for (const cid of participated) {
    if (cid >= 100000) continue;
    const problems = [...(contestIdx.get(cid)?.values() || [])]
      .sort((a, b) => String(a.index).localeCompare(String(b.index)))
      .map((pr) => ({ ...pr, url: problemUrl(cid, pr.index), status: pr.solved ? 'ok' : 'tried' }));
    const solved = problems.filter((x) => x.status === 'ok').length;
    const rh = ratingBy.get(cid) || null;
    const mm = meta.get(cid);
    contests.push({
      id: cid,
      name: mm?.name || `Contest ${cid}`,
      url: `https://codeforces.com/contest/${cid}`,
      startTime: mm?.startTimeSeconds || rh?.ratingUpdateTimeSeconds || null,
      duration: mm?.durationSeconds || 0,
      type: mm?.type || 'CF',
      rank: rh?.rank ?? null,
      oldRating: rh?.oldRating ?? null,
      newRating: rh?.newRating ?? null,
      delta: rh ? rh.newRating - rh.oldRating : null,
      rated: !!rh,
      subs: problems.reduce((a, x) => a + x.tries, 0),
      solved,
      total: problems.length,
      unfinished: problems.length - solved,
      halfDone: solved > 0 && solved < problems.length,
      untouched: solved === 0,
      problems,
    });
  }
  contests.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

  const upcoming = cList
    .filter((c) => c.phase === 'BEFORE' && c.startTimeSeconds > nowSec)
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
    .map((c) => ({ id: c.id, name: c.name, type: c.type, startTime: c.startTimeSeconds, duration: c.durationSeconds, url: `https://codeforces.com/contest/${c.id}` }));

  const unsolved = [];
  const practiceUnsolved = [];
  for (const pr of byProb.values()) {
    if (pr.solved) continue;
    const item = { ...pr, url: problemUrl(pr.contestId, pr.index) };
    const c = contests.find((x) => x.id === pr.contestId);
    if (c) unsolved.push({ ...item, contestName: c.name, contestTime: c.startTime, source: 'cf' });
    else practiceUnsolved.push({ ...item, source: 'cf-practice' });
  }
  unsolved.sort(cmp);
  practiceUnsolved.sort(cmp);

  const byDifficulty = BUCKETS.map(([min, max, label]) => ({
    min,
    max,
    label,
    problems: unsolved.filter((p) => {
      const r = p.rating ?? 0;
      return r >= min && r <= max;
    }),
  })).filter((b) => b.problems.length);

  const tagMap = new Map();
  for (const p of unsolved) for (const t of p.tags || []) (tagMap.get(t) || tagMap.set(t, []).get(t)).push(p);
  const byTag = [...tagMap]
    .map(([tag, problems]) => ({ tag, count: problems.length, problems: problems.sort(cmp) }))
    .sort((a, b) => b.count - a.count);

  const ratingHistory = rating.map((r) => ({
    contestId: r.contestId,
    name: r.contestName,
    time: new Date(r.ratingUpdateTimeSeconds * 1000).toISOString(),
    rank: r.rank,
    old: r.oldRating,
    now: r.newRating,
  }));

  // 热力（近 90 天）
  const dayCount = new Map();
  for (const s of subs) {
    const d = new Date(s.creationTimeSeconds * 1000);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dayCount.set(k, (dayCount.get(k) || 0) + 1);
  }
  const today = new Date();
  const heat = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400e3);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    heat.push({ date: k, count: dayCount.get(k) || 0 });
  }

  const solvedCount = [...byProb.values()].filter((x) => x.solved).length;
  const cf = { handle: u.handle, upcoming, contests, unsolved, practiceUnsolved, byDifficulty, byTag, ratingHistory };
  const summaryCf = {
    handle: u.handle,
    avatar: u.titlePhoto || u.avatar,
    rating: u.rating,
    maxRating: u.maxRating,
    rank: u.rank,
    maxRank: u.maxRank,
    submissions: subs.length,
    solved: solvedCount,
    contests: contests.filter((c) => c.rated).length,
    upcoming: upcoming.length,
    unfinished: unsolved.length,
    halfDone: contests.filter((c) => c.halfDone).length,
    practiceUnsolved: practiceUnsolved.length,
  };
  const weakTags = byTag.map((t) => ({ tag: t.tag, missing: t.count, solved: 0 })).sort((a, b) => b.missing - a.missing).slice(0, 10);
  const nextUp = {
    cf: unsolved.filter((p) => p.status === 'tried').slice(0, 3),
    cfNew: unsolved.filter((p) => p.status === 'todo').slice(0, 3),
    luogu: [],
    training: [],
  };
  return { cf, summaryCf, heat, weakTags, nextUp };
}

// 把实时 CF 数据写回 data；洛谷置空（无开放接口）。整体放在按需块里，不占主包体积。
export async function applyLive(handle, data) {
  const r = await fetchCfLive(handle);
  data.summary.cf = r.summaryCf;
  data.summary.heat = r.heat;
  data.summary.weakTags = r.weakTags;
  data.summary.nextUp = r.nextUp;
  data.summary.luogu = { uid: '', name: '—', avatar: null, rating: null, ranking: null, passed: 0, submitted: 0, trainings: 0 };
  data.cf = r.cf;
  data.luogu = { uid: '', profile: {}, passed: [], unsolved: [], trainings: [], contests: { upcoming: [] }, stats: { byDifficulty: [] }, elo: [] };
}

// 实时视图顶栏提示；文案放这里，主包只留一个短兜底。
export function liveBanner({ handle, error }) {
  if (error) return h('div', { class: 'card error' }, h('p', {}, `实时查询失败：${error}`), h('p', { class: 'muted' }, '已保留默认数据，稍后重试或检查 handle 拼写。'));
  if (handle) return h('div', { class: 'card live-note' }, `正在实时查看 Codeforces 用户 ${handle} 的公开数据。实时查询仅支持 CF；洛谷无开放接口，本视图下洛谷部分为空。`);
  return null;
}
