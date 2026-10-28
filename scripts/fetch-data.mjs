#!/usr/bin/env node
/**
 * fetch-data.mjs — 抓取 Codeforces + 洛谷数据，生成前端静态 JSON
 *
 *   node scripts/fetch-data.mjs [--refresh] [--cf=Seas1989] [--luogu=1864907]
 *
 * 产出：
 *   public/data/summary.json   总览
 *   public/data/cf.json        CF 比赛 / 未完成题 / 题单分档
 *   public/data/luogu.json     洛谷资料 / 未通过题 / 官方题单进度
 *
 * 只读公开页面与公开 API，不写入任何账号凭据。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(ROOT, 'public', 'data');

const args = process.argv.slice(2);
const REFRESH = args.includes('--refresh');
const argOf = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;

/** config.json 是「这个站归谁」的配置；命令行参数优先于它，它优先于内置默认值 */
const CONFIG_PATH = path.join(ROOT, 'config.json');
const config = (() => {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
})();

const CF_HANDLE = argOf('cf', config.cf || 'Seas1989');
const LUOGU_UID = String(argOf('luogu', config.luogu || '1864907'));

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);

// ---------------------------------------------------------------- cache
function cacheGet(name, ttlMs) {
  const f = path.join(CACHE, name + '.json');
  if (REFRESH || !fs.existsSync(f)) return null;
  const st = fs.statSync(f);
  if (ttlMs && Date.now() - st.mtimeMs > ttlMs) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}
function cacheSet(name, data) {
  fs.writeFileSync(path.join(CACHE, name + '.json'), JSON.stringify(data));
}

// ---------------------------------------------------------------- CF
const CF = 'https://codeforces.com/api';

async function cfApi(method, params, { ttl = 10 * 60e3, name } = {}) {
  const key = name || `cf-${method}-${JSON.stringify(params).replace(/[^\w]/g, '')}`;
  const hit = cacheGet(key, ttl);
  if (hit) return hit;
  const qs = new URLSearchParams(params).toString();
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${CF}/${method}${qs ? '?' + qs : ''}`, { headers: { 'user-agent': UA } });
    if (res.status === 429) {
      await sleep(4000 * (i + 1));
      continue;
    }
    const txt = await res.text();
    let j;
    try {
      j = JSON.parse(txt);
    } catch {
      await sleep(2000);
      continue;
    }
    if (j.status !== 'OK') throw new Error(`${method}: ${j.comment || 'CF error'}`);
    cacheSet(key, j.result);
    await sleep(1100);
    return j.result;
  }
  throw new Error(`${method} 请求失败`);
}

async function cfUserStatus(handle) {
  const out = [];
  for (let from = 1; from <= 20000; from += 1000) {
    const batch = await cfApi('user.status', { handle, from, count: 1000 }, { ttl: 10 * 60e3, name: `cf-status-${handle}-${from}` });
    out.push(...batch);
    if (batch.length < 1000) break;
  }
  return out;
}

// ---------------------------------------------------------------- 洛谷
const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
function absorb(res) {
  const raw = res.headers.get('set-cookie') || '';
  for (const part of raw.split(/,(?=[^;]+=[^;,]+)/)) {
    const m = /^([^=]+)=([^;]*)/.exec(part.trim());
    if (m) jar.set(m[1], m[2]);
  }
}

async function luoguGet(route, { ttl = 6 * 3600e3, name } = {}) {
  const key = name || `lg-${route.replace(/[^\w]/g, '_')}`;
  const hit = cacheGet(key, ttl);
  if (hit) return hit;
  let body = '';
  for (let i = 0; i < 6; i++) {
    const res = await fetch('https://www.luogu.com.cn' + route, {
      redirect: 'manual',
      headers: { 'user-agent': UA, cookie: cookieHeader(), accept: 'text/html,application/json' },
    });
    absorb(res);
    if (res.status >= 300 && res.status < 400) continue;
    body = await res.text();
    break;
  }
  const m = /<script id="lentille-context" type="application\/json">([\s\S]*?)<\/script>/.exec(body);
  let ctx;
  if (m) {
    ctx = JSON.parse(m[1]);
  } else {
    try {
      ctx = { __json: JSON.parse(body) }; // /_lfe/* 直接返回 JSON
    } catch {
      throw new Error(`洛谷解析失败: ${route}`);
    }
  }
  await sleep(500);
  cacheSet(key, ctx);
  return ctx;
}

// ---------------------------------------------------------------- 抓取
log('▶ Codeforces');
const [info, ratingHist, subs, contestList, psProblems] = await Promise.all([
  cfApi('user.info', { handles: CF_HANDLE }, { name: 'cf-info' }),
  cfApi('user.rating', { handle: CF_HANDLE }, { name: 'cf-rating' }),
  cfUserStatus(CF_HANDLE),
  cfApi('contest.list', { gym: 'false' }, { ttl: 30 * 60e3, name: 'cf-contests' }),
  cfApi('problemset.problems', {}, { ttl: 6 * 3600e3, name: 'cf-problems' }),
]);
log(`  提交 ${subs.length} 条 / 比赛记录 ${ratingHist.length} 场 / 题库 ${psProblems.problems.length} 题`);

log('▶ 洛谷');
const lgProfile = await luoguGet(`/user/${LUOGU_UID}`, { name: 'lg-profile' });
const lgPractice = await luoguGet(`/user/${LUOGU_UID}/practice`, { name: 'lg-practice' });
const lgTrainings = await luoguGet('/training/list', { name: 'lg-trainings', ttl: 24 * 3600e3 });
const lgTags = (await luoguGet('/_lfe/tags', { name: 'lg-tags', ttl: 24 * 3600e3 })).__json || {};
let lgContestRaw = [];
try {
  const lgContestList = await luoguGet('/contest/list', { name: 'lg-contest-list', ttl: 3600e3 });
  lgContestRaw = lgContestList?.data?.contests?.result || [];
} catch (e) {
  console.warn('  洛谷比赛列表抓取失败，降级为空：', e.message);
}
log(`  通过 ${lgPractice.data.passed.length} 题 / 未通过 ${lgPractice.data.submitted.length} 题 / 题单 ${lgTrainings.data.trainings.result.length} 个 / 比赛列表 ${lgContestRaw.length} 场`);

// 标签字典：/ _lfe/tags 可能是 {tl, ...} 或数组
const tagName = new Map();
(function collectTags(node) {
  if (!node) return;
  if (Array.isArray(node)) return node.forEach(collectTags);
  if (typeof node === 'object') {
    if (typeof node.id === 'number' && typeof node.name === 'string') tagName.set(node.id, node.name);
    if (node.tags) collectTags(node.tags);
    if (node.children) collectTags(node.children);
  }
})(lgTags);

// ---------------------------------------------------------------- 索引
const problemIdx = new Map(); // "1968A" -> {name, rating, tags}
const contestProblems = new Map(); // contestId -> [problems]
for (const p of psProblems.problems) {
  const key = `${p.contestId}${p.index}`;
  problemIdx.set(key, p);
  if (!contestProblems.has(p.contestId)) contestProblems.set(p.contestId, []);
  contestProblems.get(p.contestId).push(p);
}

const contestName = new Map(contestList.map((c) => [c.id, c.name]));
const ratingByContest = new Map(ratingHist.map((r) => [r.contestId, r]));

// ---------------------------------------------------------------- 提交聚合
const subByProblem = new Map(); // key -> {solved, tries, lastVerdict, lastAt, firstAt}
const contestStat = new Map(); // contestId -> {solved:Set, tried:Set, subs:0}

for (const s of subs) {
  const p = s.problem;
  if (!p) continue;
  const key = `${p.contestId}${p.index}`;
  const rec = subByProblem.get(key) || { solved: false, tries: 0, lastVerdict: '', lastAt: 0, firstAt: Infinity };
  rec.tries++;
  rec.lastAt = Math.max(rec.lastAt, s.creationTimeSeconds);
  rec.firstAt = Math.min(rec.firstAt, s.creationTimeSeconds);
  rec.lastVerdict = s.verdict;
  if (s.verdict === 'OK') rec.solved = true;
  subByProblem.set(key, rec);

  if (p.contestId) {
    const c = contestStat.get(p.contestId) || { solved: new Set(), tried: new Set(), subs: 0 };
    c.subs++;
    c.tried.add(p.index);
    if (s.verdict === 'OK') c.solved.add(p.index);
    contestStat.set(p.contestId, c);
  }
}

// 每日提交热力（近 90 天）
const dayCount = new Map();
for (const s of subs) {
  const d = new Date(s.creationTimeSeconds * 1000);
  const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  dayCount.set(k, (dayCount.get(k) || 0) + 1);
}

// ---------------------------------------------------------------- 比赛
const VERDICT = {
  WRONG_ANSWER: 'WA',
  TIME_LIMIT_EXCEEDED: 'TLE',
  MEMORY_LIMIT_EXCEEDED: 'MLE',
  RUNTIME_ERROR: 'RE',
  COMPILATION_ERROR: 'CE',
  IDLENESS_LIMIT_EXCEEDED: 'ILE',
  PARTIAL: '部分分',
  SKIPPED: '跳过',
};

function problemUrl(contestId, index) {
  if (!contestId) return `https://codeforces.com/problemset/problem/${index}`;
  const seg = contestId >= 100000 ? 'gym' : 'contest';
  return `https://codeforces.com/${seg}/${contestId}/problem/${index}`;
}

const MY_CONTESTS = [];
// 参赛判定：有 rating 记录，或在比赛时段内提交过
const contestMeta = new Map(contestList.map((c) => [c.id, c]));
const participated = new Set(ratingHist.map((r) => r.contestId));
for (const s of subs) {
  const cid = s.problem?.contestId;
  const meta = cid ? contestMeta.get(cid) : null;
  if (meta && s.creationTimeSeconds >= meta.startTimeSeconds && s.creationTimeSeconds <= meta.startTimeSeconds + meta.durationSeconds) {
    participated.add(cid);
  }
}

for (const cid of participated) {
  if (cid >= 100000) continue; // gym 单独，先不混进正式比赛
  const st = contestStat.get(cid) || { solved: new Set(), tried: new Set(), subs: 0 };
  const set = contestProblems.get(cid) || [];
  const rh = ratingByContest.get(cid) || null;
  const meta0 = contestMeta.get(cid);
  const problems = (set.length ? set : [...st.tried].map((idx) => ({ contestId: cid, index: idx })))
    .slice()
    .sort((a, b) => a.index.localeCompare(b.index))
    .map((p) => {
      const key = `${cid}${p.index}`;
      const rec = subByProblem.get(key);
      const status = rec?.solved ? 'ok' : rec ? 'tried' : 'todo';
      const meta = problemIdx.get(key) || p;
      return {
        index: p.index,
        name: meta.name || `${cid}${p.index}`,
        rating: meta.rating ?? null,
        tags: meta.tags || [],
        status,
        tries: rec?.tries || 0,
        lastVerdict: VERDICT[rec?.lastVerdict] || rec?.lastVerdict || '',
        url: problemUrl(cid, p.index),
      };
    });
  const solved = problems.filter((p) => p.status === 'ok').length;
  MY_CONTESTS.push({
    id: cid,
    name: contestName.get(cid) || `Contest ${cid}`,
    url: `https://codeforces.com/contest/${cid}`,
    startTime: meta0?.startTimeSeconds || (rh ? rh.ratingUpdateTimeSeconds : null),
    duration: meta0?.durationSeconds || 0,
    type: meta0?.type || 'CF',
    rank: rh ? rh.rank : null,
    oldRating: rh ? rh.oldRating : null,
    newRating: rh ? rh.newRating : null,
    delta: rh ? rh.newRating - rh.oldRating : null,
    rated: !!rh,
    subs: st.subs,
    solved,
    total: problems.length,
    unfinished: problems.length - solved,
    halfDone: solved > 0 && solved < problems.length,
    untouched: solved === 0,
    problems,
  });
}
MY_CONTESTS.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

// 即将开始
const nowSec = Date.now() / 1000;
const upcoming = contestList
  .filter((c) => c.phase === 'BEFORE' && c.startTimeSeconds > nowSec)
  .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
  .map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    startTime: c.startTimeSeconds,
    duration: c.durationSeconds,
    url: `https://codeforces.com/contest/${c.id}`,
  }));

// ---------------------------------------------------------------- 未完成题 & 题单
const unsolvedAll = [];
for (const c of MY_CONTESTS) {
  for (const p of c.problems) {
    if (p.status === 'ok') continue;
    unsolvedAll.push({
      ...p,
      contestId: c.id,
      contestName: c.name,
      contestTime: c.startTime,
      source: 'cf',
    });
  }
}
unsolvedAll.sort((a, b) => (a.rating ?? 9999) - (b.rating ?? 9999) || b.tries - a.tries);

// 题库练习中没过的题（不属于任何参赛场次）
const practiceUnsolved = [];
for (const [key, rec] of subByProblem) {
  if (rec.solved) continue;
  const cid = Number((/^(\d+)/.exec(key) || [])[1]);
  if (cid && participated.has(cid)) continue; // 已在比赛未完成里统计
  const p = problemIdx.get(key);
  if (!p) continue;
  practiceUnsolved.push({
    contestId: p.contestId,
    index: p.index,
    name: p.name,
    rating: p.rating ?? null,
    tags: p.tags || [],
    tries: rec.tries,
    lastVerdict: VERDICT[rec.lastVerdict] || rec.lastVerdict,
    url: problemUrl(p.contestId, p.index),
    source: 'cf-practice',
  });
}
practiceUnsolved.sort((a, b) => (a.rating ?? 9999) - (b.rating ?? 9999) || b.tries - a.tries);

const BUCKETS = [
  { key: 'r800', label: '800–1000 入门', min: 0, max: 1000 },
  { key: 'r1200', label: '1100–1300 普及-', min: 1001, max: 1300 },
  { key: 'r1400', label: '1301–1500 普及/提高-', min: 1301, max: 1500 },
  { key: 'r1600', label: '1501–1700 提高', min: 1501, max: 1700 },
  { key: 'r1800', label: '1701–1900 提高+', min: 1701, max: 1900 },
  { key: 'r2100', label: '1901–2100 省选-', min: 1901, max: 2100 },
  { key: 'r2400', label: '2101+ 省选+', min: 2101, max: 9999 },
];
const byDifficulty = BUCKETS.map((b) => ({
  ...b,
  problems: unsolvedAll.filter((p) => {
    const r = p.rating ?? 0;
    return r >= b.min && r <= b.max;
  }),
})).filter((b) => b.problems.length);

const tagMap = new Map();
for (const p of unsolvedAll) {
  for (const t of p.tags) {
    if (!tagMap.has(t)) tagMap.set(t, []);
    tagMap.get(t).push(p);
  }
}
const byTag = [...tagMap.entries()]
  .map(([tag, problems]) => ({ tag, count: problems.length, problems: problems.sort((a, b) => (a.rating ?? 9999) - (b.rating ?? 9999)) }))
  .sort((a, b) => b.count - a.count);

// 薄弱标签：未完成题中出现多、已完成少
const solvedTagCount = new Map();
for (const s of subs) {
  if (s.verdict !== 'OK' || !s.problem) continue;
  for (const t of s.problem.tags || []) solvedTagCount.set(t, (solvedTagCount.get(t) || 0) + 1);
}
const weakTags = byTag
  .map((t) => ({ tag: t.tag, missing: t.count, solved: solvedTagCount.get(t.tag) || 0 }))
  .sort((a, b) => b.missing - a.missing || a.solved - b.solved)
  .slice(0, 10);

const solvedTotal = new Set([...subByProblem.entries()].filter(([, v]) => v.solved).map(([k]) => k)).size;

// ---------------------------------------------------------------- 洛谷题单
const LG_DIFF = { 1: '入门', 2: '普及-', 3: '普及/提高-', 4: '普及+/提高', 5: '提高+/省选-', 6: '省选/NOI-', 7: 'NOI/CTF' };
const passedSet = new Set(lgPractice.data.passed.map((p) => p.pid));
const lgTrainingDetails = [];
for (const t of lgTrainings.data.trainings.result) {
  let detail;
  try {
    detail = await luoguGet(`/training/${t.id}`, { name: `lg-training-${t.id}`, ttl: 24 * 3600e3 });
  } catch {
    continue;
  }
  const tr = detail.data?.training;
  if (!tr?.problems) continue;
  const problems = tr.problems.map((p, i) => ({
    pid: p.pid,
    name: p.name,
    difficulty: p.difficulty,
    diffLabel: LG_DIFF[p.difficulty] || '未定级',
    tags: (p.tags || []).map((id) => tagName.get(id)).filter(Boolean),
    passed: passedSet.has(p.pid),
    order: i + 1,
    url: `https://www.luogu.com.cn/problem/${p.pid}`,
  }));
  lgTrainingDetails.push({
    id: t.id,
    name: t.name,
    problemCount: tr.problemCount,
    markCount: t.markCount,
    desc: (tr.description || '').slice(0, 200),
    done: problems.filter((p) => p.passed).length,
    problems,
    next: problems.find((p) => !p.passed) || null,
  });
}
lgTrainingDetails.sort((a, b) => b.problemCount - a.problemCount);

const lgUnsolved = lgPractice.data.submitted
  .map((p) => ({
    pid: p.pid,
    name: p.name,
    difficulty: p.difficulty,
    diffLabel: LG_DIFF[p.difficulty] || '未定级',
    url: `https://www.luogu.com.cn/problem/${p.pid}`,
  }))
  .sort((a, b) => a.difficulty - b.difficulty);

// 洛谷即将开始的比赛（startTime > 现在，取最近 6 场）
const lgUpcoming = lgContestRaw
  .filter((c) => c.startTime > nowSec)
  .sort((a, b) => a.startTime - b.startTime)
  .slice(0, 6)
  .map((c) => ({
    id: c.id,
    name: c.name,
    startTime: c.startTime,
    endTime: c.endTime,
    host: c.host?.name || '',
    problemCount: c.problemCount ?? null,
    rated: !!c.rated,
    url: `https://www.luogu.com.cn/contest/${c.id}`,
  }));

// 洛谷已通过题目按难度 1~7 统计
const lgDiffCount = new Map();
for (const p of lgPractice.data.passed) {
  if (p.difficulty >= 1 && p.difficulty <= 7) lgDiffCount.set(p.difficulty, (lgDiffCount.get(p.difficulty) || 0) + 1);
}
const lgByDifficulty = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ d, count: lgDiffCount.get(d) || 0 }));

// ---------------------------------------------------------------- 输出
const today = new Date();
const iso = (sec) => (sec ? new Date(sec * 1000).toISOString() : null);
const recentDays = [];
for (let i = 89; i >= 0; i--) {
  const d = new Date(today.getTime() - i * 86400e3);
  const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  recentDays.push({ date: k, count: dayCount.get(k) || 0 });
}

const summary = {
  generatedAt: new Date().toISOString(),
  cf: {
    handle: info[0].handle,
    avatar: info[0].titlePhoto || info[0].avatar,
    rating: info[0].rating,
    maxRating: info[0].maxRating,
    rank: info[0].rank,
    maxRank: info[0].maxRank,
    registeredAt: iso(info[0].registrationTimeSeconds),
    submissions: subs.length,
    solved: solvedTotal,
    contests: MY_CONTESTS.filter((c) => c.rated).length,
    upcoming: upcoming.length,
    unfinished: unsolvedAll.length,
    halfDone: MY_CONTESTS.filter((c) => c.halfDone).length,
    practiceUnsolved: practiceUnsolved.length,
  },
  luogu: {
    uid: LUOGU_UID,
    name: lgProfile.data.user.name,
    avatar: lgProfile.data.user.avatar,
    rating: lgProfile.data.gu.rating,
    ranking: lgProfile.data.user.ranking,
    passed: lgPractice.data.passed.length,
    submitted: lgPractice.data.submitted.length,
    trainings: lgTrainingDetails.length,
    registerTime: iso(lgProfile.data.user.registerTime),
  },
  heat: recentDays,
  weakTags,
  nextUp: {
    cf: unsolvedAll.filter((p) => p.status === 'tried').slice(0, 3),
    cfNew: unsolvedAll.filter((p) => p.status === 'todo').slice(0, 3),
    luogu: lgUnsolved.slice(0, 3),
    training: lgTrainingDetails.filter((t) => t.next).slice(0, 3).map((t) => ({ id: t.id, name: t.name, next: t.next })),
  },
};

const cf = {
  handle: CF_HANDLE,
  upcoming,
  contests: MY_CONTESTS,
  unsolved: unsolvedAll,
  practiceUnsolved,
  byDifficulty,
  byTag,
  ratingHistory: ratingHist.map((r) => ({
    contestId: r.contestId,
    name: r.contestName,
    time: iso(r.ratingUpdateTimeSeconds),
    rank: r.rank,
    old: r.oldRating,
    now: r.newRating,
  })),
};

const luogu = {
  uid: LUOGU_UID,
  profile: summary.luogu,
  passed: lgPractice.data.passed.map((p) => ({
    pid: p.pid,
    name: p.name,
    difficulty: p.difficulty,
    diffLabel: LG_DIFF[p.difficulty] || '未定级',
    url: `https://www.luogu.com.cn/problem/${p.pid}`,
  })),
  unsolved: lgUnsolved,
  trainings: lgTrainingDetails,
  contests: { upcoming: lgUpcoming },
  stats: { byDifficulty: lgByDifficulty },
  elo: (lgProfile.data.elo || []).map((e) => ({ contest: e.contest?.name, rating: e.rating, time: iso(e.time) })),
};

fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
fs.writeFileSync(path.join(OUT, 'cf.json'), JSON.stringify(cf, null, 1));
fs.writeFileSync(path.join(OUT, 'luogu.json'), JSON.stringify(luogu, null, 1));

log('');
log('=== 完成 ===');
log(`CF  ${summary.cf.handle}  rating ${summary.cf.rating}  比赛 ${summary.cf.contests} 场  未完成题 ${summary.cf.unfinished}`);
log(`洛谷 ${summary.luogu.name}  rating ${summary.luogu.rating}  通过 ${summary.luogu.passed}  未通过 ${summary.luogu.submitted}`);
log(`即将开始 ${upcoming.length} 场  最近：${upcoming[0]?.name || '无'}`);
log(`半途而废的比赛 ${MY_CONTESTS.filter((c) => c.halfDone).length} 场`);
for (const b of byDifficulty) log(`  ${b.label}: ${b.problems.length}`);
log(`输出目录 ${OUT}`);
