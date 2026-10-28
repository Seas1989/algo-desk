#!/usr/bin/env node
/**
 * fetch-luogu-extra.mjs — 为「额外收录的洛谷用户」生成快照
 *
 * 为什么需要这个：洛谷没有开放接口、也没有 CORS，浏览器里拿不到任何人的洛谷数据。
 * 所以站点只能读构建时写好的 JSON。站主本人的数据由 fetch-data.mjs 产出成 luogu.json，
 * 其他人在 config.json 的 users 里登记后，由这个脚本产出 public/data/luogu-<uid>.json。
 *
 * 每个用户只发两个请求（个人主页 + 练习情况），官方题单的结构直接从站主的 luogu.json
 * 复用 —— 题单列表对所有人一样，没必要给每个人再抓 18 次详情。
 *
 *   node scripts/fetch-luogu-extra.mjs [--refresh]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(ROOT, 'public', 'data');
const REFRESH = process.argv.slice(2).includes('--refresh');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(CACHE, { recursive: true });

const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

const config = readJson(path.join(ROOT, 'config.json')) || {};
const primary = readJson(path.join(OUT, 'luogu.json'));
if (!primary) {
  console.error('先跑 npm run fetch 生成 public/data/luogu.json（题单结构要复用它的）');
  process.exit(1);
}

const users = (config.users || []).filter((u) => u && u.luogu);
const extras = users.filter((u) => String(u.luogu) !== String(primary.uid));
if (!extras.length) {
  console.log('config.json 里没有额外用户，跳过');
  process.exit(0);
}

/* ---------- 洛谷抓取：C3VK 反爬 cookie ---------- */
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
  const cacheFile = path.join(CACHE, key + '.json');
  if (!REFRESH && fs.existsSync(cacheFile)) {
    const st = fs.statSync(cacheFile);
    if (Date.now() - st.mtimeMs < ttl) {
      const hit = readJson(cacheFile);
      if (hit) return hit;
    }
  }

  let body = '';
  for (let i = 0; i < 6; i++) {
    const res = await fetch('https://www.luogu.com.cn' + route, {
      redirect: 'manual',
      headers: { 'user-agent': UA, cookie: cookieHeader(), accept: 'text/html,application/json' },
    });
    absorb(res);
    if (res.status >= 300 && res.status < 400) continue; // 拿到 C3VK 后重试
    body = await res.text();
    break;
  }

  const m = /<script id="lentille-context" type="application\/json">([\s\S]*?)<\/script>/.exec(body);
  if (!m) throw new Error(`洛谷解析失败: ${route}`);
  const ctx = JSON.parse(m[1]);
  fs.writeFileSync(cacheFile, JSON.stringify(ctx));
  await sleep(600);
  return ctx;
}

/* ---------- 难度档 ---------- */
const LG_DIFF = { 1: '入门', 2: '普及-', 3: '普及/提高-', 4: '普及+/提高', 5: '提高+/省选-', 6: '省选/NOI-', 7: 'NOI/CTF' };

const iso = (sec) => (sec ? new Date(sec * 1000).toISOString() : null);

async function buildOne(uid) {
  const profile = await luoguGet(`/user/${uid}`, { name: `lg-profile-${uid}` });
  const practice = await luoguGet(`/user/${uid}/practice`, { name: `lg-practice-${uid}` });

  const u = profile.data.user;
  const passed = (practice.data.passed || []).map((p) => ({
    pid: p.pid,
    name: p.name,
    difficulty: p.difficulty,
    diffLabel: LG_DIFF[p.difficulty] || '未定级',
    url: `https://www.luogu.com.cn/problem/${p.pid}`,
  }));
  const unsolved = (practice.data.submitted || [])
    .map((p) => ({
      pid: p.pid,
      name: p.name,
      difficulty: p.difficulty,
      diffLabel: LG_DIFF[p.difficulty] || '未定级',
      url: `https://www.luogu.com.cn/problem/${p.pid}`,
    }))
    .sort((a, b) => a.difficulty - b.difficulty);

  const passedSet = new Set(passed.map((p) => p.pid));

  // 题单结构复用站主那份：题单对所有人是同一批题，只有「过没过」因人而异
  const trainings = (primary.trainings || []).map((t) => {
    const problems = (t.problems || []).map((p) => ({ ...p, passed: passedSet.has(p.pid) }));
    const done = problems.filter((p) => p.passed).length;
    return { ...t, problems, done, next: problems.find((p) => !p.passed) || null };
  });

  const diffCount = new Map();
  for (const p of passed) {
    if (p.difficulty >= 1 && p.difficulty <= 7) diffCount.set(p.difficulty, (diffCount.get(p.difficulty) || 0) + 1);
  }

  return {
    uid: String(uid),
    profile: {
      uid: String(uid),
      name: u.name,
      avatar: u.avatar,
      rating: profile.data.gu?.rating ?? null,
      ranking: u.ranking ?? null,
      passed: passed.length,
      submitted: unsolved.length,
      trainings: trainings.length,
      registerTime: iso(u.registerTime),
    },
    passed,
    unsolved,
    trainings,
    // 比赛是公共信息，直接沿用站主那份
    contests: primary.contests || { upcoming: [] },
    stats: { byDifficulty: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ d, count: diffCount.get(d) || 0 })) },
    elo: (profile.data.elo || []).map((e) => ({
      contest: e.contest?.name,
      rating: e.rating,
      time: iso(e.time),
    })),
  };
}

for (const u of extras) {
  process.stdout.write(`▶ 洛谷 ${u.luogu}${u.label ? `（${u.label}）` : ''} `);
  try {
    const snap = await buildOne(String(u.luogu));
    fs.writeFileSync(path.join(OUT, `luogu-${u.luogu}.json`), JSON.stringify(snap, null, 1));
    console.log(`✓ ${snap.profile.name}  通过 ${snap.profile.passed} · 未过 ${snap.profile.submitted}`);
  } catch (e) {
    console.log(`✗ ${e.message}`);
  }
}

console.log(`\n快照写入 ${OUT}`);
