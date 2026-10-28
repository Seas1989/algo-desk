/**
 * problem-agent.js — 取题 agent
 *
 * 这个站上「哪道题可以排进计划」只在这里回答一次，别处都调它。
 * 在它之外，AI 不许自己编题号——返回的 key 必须能在池子里查到，否则丢弃。
 *
 * 池子来自三处：
 *   1. Codeforces 未完成（实时拉来的，status 是 tried / todo）
 *   2. 洛谷官方题单里还没通过的
 *   3. 洛谷「任务计划」小栏里还没打勾的
 */

const LG_DIFF = ['', '入门', '普及-', '普及/提高-', '普及+/提高', '提高+/省选-', '省选/NOI-', 'NOI/CTF'];

const keyOfCf = (p) => `cf:${p.contestId}${p.index}`;

/** 组装候选池，去重后按「卡过的优先、难度升序」排 */
export function buildPool(data, box) {
  const map = new Map();

  const push = (item) => {
    if (!item.key || map.has(item.key)) return;
    map.set(item.key, item);
  };

  for (const p of data?.cf?.unsolved || []) {
    push({
      key: keyOfCf(p),
      source: 'cf',
      pid: `${p.contestId}${p.index}`,
      name: p.name,
      rating: p.rating ?? null,
      tags: p.tags || [],
      status: p.status || 'todo',
      url: p.url,
      isLG: false,
    });
  }

  for (const t of data?.luogu?.trainings || []) {
    for (const p of t.problems || []) {
      if (p.passed) continue;
      push({
        key: `lg:${p.pid}`,
        source: 'luogu',
        pid: p.pid,
        name: p.name,
        difficulty: p.difficulty ?? null,
        tags: (p.tags || []).slice(0, 3),
        status: 'todo',
        url: p.url || `https://www.luogu.com.cn/problem/${p.pid}`,
        isLG: true,
        training: t.name,
      });
    }
  }

  for (const it of box?.items || []) {
    if (it.done) continue;
    push({
      key: `lg:${it.pid}`,
      source: 'box',
      pid: it.pid,
      name: it.name,
      difficulty: null,
      tags: [],
      status: 'todo',
      url: it.url || `https://www.luogu.com.cn/problem/${it.pid}`,
      isLG: true,
    });
  }

  return [...map.values()].sort((a, b) => {
    const w = (x) => (x.status === 'tried' ? 0 : 1);
    if (w(a) !== w(b)) return w(a) - w(b);
    return (a.rating ?? 9999) - (b.rating ?? 9999);
  });
}

const diffText = (p) =>
  p.isLG ? (p.difficulty ? LG_DIFF[p.difficulty] || `${p.difficulty} 级` : '未定级') : p.rating == null ? '未定级' : String(p.rating);

/**
 * 给 AI 的紧凑候选清单。
 * 一行一题：key 难度 标签 —— 只给这些，模型才不会去编别的题号。
 */
export function poolForAI(pool, { limit = 60 } = {}) {
  const picked = pool.slice(0, limit);
  const lines = picked.map((p) => {
    const tags = (p.tags || []).slice(0, 2).join('/') || '—';
    const tried = p.status === 'tried' ? ' [卡过]' : '';
    return `${p.key} ${diffText(p)} ${tags}${tried}`;
  });
  return { lines, keys: new Set(picked.map((p) => p.key)), total: pool.length, used: picked.length };
}

/** 校验 AI 给的 key：只认池子里真实存在的 */
export function pickByKeys(pool, keys) {
  const byKey = new Map(pool.map((p) => [p.key, p]));
  const out = [];
  const bad = [];
  for (const k of keys || []) {
    const p = byKey.get(String(k).trim());
    if (p) out.push(p);
    else bad.push(k);
  }
  return { items: out, bad };
}

export { diffText, LG_DIFF };
