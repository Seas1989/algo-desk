#!/usr/bin/env node
/**
 * cf_plan.mjs — 抓取 Codeforces 提交记录，生成「尝试过但未 AC」的做题计划
 *
 * 用法：
 *   node cf_plan.mjs <handle> [handle2 ...] [--days=14] [--max-rating=2200] [--per-day=2] [--out=做题计划.md]
 *
 * 输出：
 *   - 控制台摘要
 *   - <out>  Markdown 计划（含概览、未 AC 题表、标签薄弱点、按天分配的计划）
 *   - <out>.json  结构化数据，便于二次加工
 */

import fs from 'node:fs';

const API = 'https://codeforces.com/api';

// ---------- 参数解析 ----------
const argv = process.argv.slice(2);
const handles = [];
const opts = { days: 14, maxRating: 2200, perDay: 2, out: '做题计划.md', minRating: 0 };

for (const a of argv) {
  const m = /^--([a-zA-Z-]+)=(.*)$/.exec(a);
  if (m) {
    const k = m[1];
    const v = m[2];
    if (k === 'days') opts.days = Math.max(1, parseInt(v, 10) || 14);
    else if (k === 'max-rating') opts.maxRating = parseInt(v, 10) || 2200;
    else if (k === 'min-rating') opts.minRating = parseInt(v, 10) || 0;
    else if (k === 'per-day') opts.perDay = Math.max(1, parseInt(v, 10) || 2);
    else if (k === 'out') opts.out = v;
  } else if (!a.startsWith('--')) {
    handles.push(a);
  }
}

if (!handles.length) {
  console.error('用法: node cf_plan.mjs <handle> [handle2 ...] [--days=14] [--max-rating=2200] [--per-day=2]');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 抓取 ----------
async function fetchJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; study-plan/1.0)' },
      });
      if (res.status === 429) {
        await sleep(3000 * (i + 1));
        continue;
      }
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        // CF 偶尔返回 HTML 错误页
        await sleep(1500 * (i + 1));
        continue;
      }
      if (data.status === 'FAILED') {
        const msg = data.comment || '';
        if (/not found|handle/i.test(msg)) throw new Error(`handle 不存在: ${msg}`);
        if (/limit/i.test(msg)) { await sleep(3000 * (i + 1)); continue; }
        throw new Error(msg);
      }
      return data;
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error(`请求失败: ${url}`);
}

async function fetchUserStatus(handle) {
  const pageSize = 1000;
  const submissions = [];
  let from = 1;

  process.stderr.write(`  拉取 ${handle} 的提交记录`);
  for (;;) {
    const data = await fetchJson(
      `${API}/user.status?handle=${encodeURIComponent(handle)}&from=${from}&count=${pageSize}`
    );
    const batch = data.result || [];
    submissions.push(...batch);
    process.stderr.write('.');
    if (batch.length < pageSize) break;
    from += pageSize;
    if (from > 50000) break;
    await sleep(700); // 遵守 1 req/s 限制
  }
  process.stderr.write(` 共 ${submissions.length} 条\n`);
  return submissions;
}

async function fetchUserInfo(handle) {
  try {
    const data = await fetchJson(`${API}/user.info?handles=${encodeURIComponent(handle)}`);
    return (data.result || [])[0] || null;
  } catch {
    return null;
  }
}

// ---------- 聚合 ----------
const keyOf = (p) => `${p.contestId ?? '?'}${p.index ?? '?'}`;

const problems = new Map(); // key -> record
const users = new Map();    // handle -> {attempts, solvedKeys:Set}

for (const handle of handles) {
  const subs = await fetchUserStatus(handle);
  const u = { handle, submissions: subs.length, solved: new Set(), attempted: new Set() };
  users.set(handle, u);

  for (const s of subs) {
    const p = s.problem;
    if (!p) continue;
    const k = keyOf(p);
    const verdict = s.verdict || 'UNKNOWN';
    const isOK = verdict === 'OK';
    const ts = (s.creationTimeSeconds || 0) * 1000;

    let rec = problems.get(k);
    if (!rec) {
      rec = {
        key: k,
        contestId: p.contestId,
        index: p.index,
        name: p.name,
        rating: typeof p.rating === 'number' ? p.rating : null,
        tags: p.tags || [],
        attempts: 0,
        solved: false,
        solvedAt: null,
        lastVerdict: verdict,
        lastAt: 0,
        handles: new Set(),
      };
      problems.set(k, rec);
    }
    rec.attempts++;
    rec.handles.add(handle);
    if (ts >= rec.lastAt) { rec.lastAt = ts; rec.lastVerdict = verdict; }
    rec.rating ??= typeof p.rating === 'number' ? p.rating : null;
    if (isOK) {
      rec.solved = true;
      if (!rec.solvedAt || ts < rec.solvedAt) rec.solvedAt = ts;
      u.solved.add(k);
    }
    u.attempted.add(k);
  }
}

const all = [...problems.values()];
const unsolved = all.filter((r) => !r.solved);
const solved = all.filter((r) => r.solved);

// ---------- 分析 ----------
const verdictLabel = {
  WRONG_ANSWER: 'WA',
  TIME_LIMIT_EXCEEDED: 'TLE',
  MEMORY_LIMIT_EXCEEDED: 'MLE',
  RUNTIME_ERROR: 'RE',
  COMPILATION_ERROR: 'CE',
  SKIPPED: '跳过',
  UNKNOWN: '未知',
  PARTIAL: '部分分',
  IDLENESS_LIMIT_EXCEEDED: 'ILE',
  SECURITY_VIOLATED: '违规',
  CRASHED: '崩溃',
  FAILED: '评测失败',
};

function bucket(r) {
  const x = r.rating ?? 0;
  if (!r.rating) return '未定级';
  if (x < 1200) return '≤1200 入门';
  if (x < 1500) return '1200–1500 普及';
  if (x < 1900) return '1500–1900 提高';
  if (x < 2200) return '1900–2200 省选';
  if (x < 2500) return '2200–2500';
  return '2500+';
}
const BUCKET_ORDER = ['≤1200 入门', '1200–1500 普及', '1500–1900 提高', '1900–2200 省选', '2200–2500', '2500+', '未定级'];

const byBucket = new Map();
for (const r of unsolved) {
  const b = bucket(r);
  if (!byBucket.has(b)) byBucket.set(b, []);
  byBucket.get(b).push(r);
}

// 标签薄弱点：未 AC 题中出现次数 vs 已 AC
const tagStat = new Map();
for (const r of unsolved) {
  for (const t of r.tags) {
    const s = tagStat.get(t) || { missing: 0, solvedTag: 0 };
    s.missing++;
    tagStat.set(t, s);
  }
}
for (const r of solved) {
  for (const t of r.tags) {
    const s = tagStat.get(t) || { missing: 0, solvedTag: 0 };
    s.solvedTag++;
    tagStat.set(t, s);
  }
}
const weakTags = [...tagStat.entries()]
  .map(([tag, s]) => ({ tag, ...s, total: s.missing + s.solvedTag }))
  .filter((t) => t.missing > 0)
  .sort((a, b) => b.missing - a.missing || a.solvedTag - b.solvedTag)
  .slice(0, 12);

// ---------- 生成计划 ----------
// 排序：难度优先，同难度按尝试次数多的优先（说明卡过，值得回访）
const pool = unsolved
  .filter((r) => (r.rating ?? 0) >= opts.minRating && (r.rating ?? 0) <= opts.maxRating)
  .sort((a, b) => {
    const ra = a.rating ?? 9999;
    const rb = b.rating ?? 9999;
    if (ra !== rb) return ra - rb;
    return b.attempts - a.attempts;
  });

// 打散：按天分配，并尽量让每天标签不重复太多
const dayPlan = Array.from({ length: opts.days }, () => []);
const perDay = opts.perDay;
const limit = Math.min(pool.length, opts.days * perDay);
const picked = pool.slice(0, limit);

picked.forEach((p, i) => {
  const day = Math.floor(i / perDay);
  if (dayPlan[day]) dayPlan[day].push(p);
});

const urlOf = (r) => {
  if (!r.contestId) return `https://codeforces.com/problemset/problem/${r.key}`;
  // gym 的 contestId 从 100000 起，路径段是 /gym/ 而非 /contest/
  const seg = r.contestId >= 100000 ? 'gym' : 'contest';
  return `https://codeforces.com/${seg}/${r.contestId}/problem/${r.index}`;
};

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const dateOf = (offset) => {
  const d = new Date(now.getTime() + offset * 86400000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ---------- Markdown ----------
const L = [];
L.push(`# Codeforces 做题计划`);
L.push('');
L.push(`> 生成时间：${dateOf(0)} ${pad(now.getHours())}:${pad(now.getMinutes())}`);
L.push(`> 账号：${handles.map((h) => '`' + h + '`').join('、')}`);
L.push('');

L.push('## 一、概览');
L.push('');
L.push('| 指标 | 数值 |');
L.push('| --- | --- |');
L.push(`| 抓取提交数 | ${[...users.values()].reduce((s, u) => s + u.submissions, 0)} |`);
L.push(`| 接触过的题目 | ${all.length} |`);
L.push(`| 已 AC | ${solved.length} |`);
L.push(`| **尝试过但未 AC** | **${unsolved.length}** |`);
const rate = all.length ? Math.round((solved.length / all.length) * 100) : 0;
L.push(`| 过题率 | ${rate}% |`);
L.push('');

for (const [h, u] of users) {
  L.push(`- \`${h}\`：提交 ${u.submissions} 次，AC ${u.solved.size} 题`);
}
L.push('');

if (!unsolved.length) {
  L.push('## 没有未 AC 的题目 🎉');
  L.push('');
  L.push('所有接触过的题都通过了。可以直接去刷新题。');
} else {
  // 难度分布
  L.push('## 二、未 AC 题目难度分布');
  L.push('');
  L.push('| 难度段 | 数量 |');
  L.push('| --- | --- |');
  for (const b of BUCKET_ORDER) {
    const arr = byBucket.get(b);
    if (arr && arr.length) L.push(`| ${b} | ${arr.length} |`);
  }
  L.push('');

  // 薄弱标签
  L.push('## 三、薄弱知识点（未 AC 题涉及最多的标签）');
  L.push('');
  L.push('| 标签 | 未 AC | 已 AC | 说明 |');
  L.push('| --- | --- | --- | --- |');
  for (const t of weakTags) {
    const hint = t.solvedTag === 0 ? '**完全没通过，优先补**' : t.missing > t.solvedTag ? '未 AC 多于已 AC' : '';
    L.push(`| ${t.tag} | ${t.missing} | ${t.solvedTag} | ${hint} |`);
  }
  L.push('');

  // 全部未 AC 清单
  L.push('## 四、未 AC 题目清单');
  L.push('');
  L.push('| # | 题目 | 难度 | 标签 | 提交次数 | 最后一次 |');
  L.push('| --- | --- | --- | --- | --- | --- |');
  const list = [...unsolved].sort((a, b) => (a.rating ?? 9999) - (b.rating ?? 9999) || b.attempts - a.attempts);
  list.forEach((r, i) => {
    const tags = r.tags.slice(0, 4).join(', ') + (r.tags.length > 4 ? '…' : '');
    L.push(
      `| ${i + 1} | [${r.contestId ?? '?'}${r.index ?? ''}. ${r.name}](${urlOf(r)}) | ${r.rating ?? '—'} | ${tags || '—'} | ${r.attempts} | ${verdictLabel[r.lastVerdict] || r.lastVerdict} |`
    );
  });
  L.push('');

  // 每日计划
  L.push(`## 五、${opts.days} 天刷题计划`);
  L.push('');
  L.push(`> 每天 ${opts.perDay} 题，难度从易到难。每题建议：限时 45 分钟 → 卡住看题解 → **关掉题解重写一遍** → 记录错误原因。`);
  L.push('');

  dayPlan.forEach((arr, idx) => {
    if (!arr.length) return;
    const label = idx === 0 ? '今天' : `第 ${idx + 1} 天`;
    L.push(`### ${label}（${dateOf(idx)}）`);
    L.push('');
    for (const r of arr) {
      L.push(`- [ ] **${r.contestId ?? '?'}${r.index ?? ''} ${r.name}**　\`${r.rating ?? '—'}\`　${r.tags.slice(0, 3).join(' / ')}`);
      L.push(`  - ${urlOf(r)}`);
    }
    L.push('');
  });

  const rest = pool.length - picked.length;
  if (rest > 0) {
    L.push(`> 计划之外还剩 **${rest}** 题未排入，可调大 \`--days\` 或 \`--per-day\`。`);
    L.push('');
  }
}

L.push('---');
L.push('');
L.push('### 使用方法');
L.push('');
L.push('```bash');
L.push('# 修改天数 / 每天题量 / 难度上限');
L.push(`node cf_plan.mjs ${handles.join(' ')} --days=21 --per-day=3 --max-rating=1900`);
L.push('```');
L.push('');

fs.writeFileSync(opts.out, L.join('\n'), 'utf8');
fs.writeFileSync(
  opts.out + '.json',
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      handles,
      totals: { submissions: all.reduce((s, r) => s + r.attempts, 0), problems: all.length, solved: solved.length, unsolved: unsolved.length },
      weakTags,
      unsolved: unsolved
        .sort((a, b) => (a.rating ?? 9999) - (b.rating ?? 9999) || b.attempts - a.attempts)
        .map((r) => ({ ...r, handles: [...r.handles], url: urlOf(r) })),
      plan: dayPlan.map((arr, i) => ({ day: i + 1, date: dateOf(i), problems: arr.map((r) => ({ key: r.key, name: r.name, rating: r.rating, url: urlOf(r) })) })),
    },
    null,
    2
  ),
  'utf8'
);

// 控制台摘要
console.log('');
console.log('=== 结果 ===');
console.log(`题目总数 ${all.length}，已 AC ${solved.length}，未 AC ${unsolved.length}`);
for (const b of BUCKET_ORDER) {
  const arr = byBucket.get(b);
  if (arr && arr.length) console.log(`  ${b}: ${arr.length}`);
}
console.log('薄弱标签:', weakTags.slice(0, 6).map((t) => `${t.tag}(${t.missing})`).join(', ') || '—');
console.log(`\n已写入: ${opts.out}`);
console.log(`已写入: ${opts.out}.json`);
