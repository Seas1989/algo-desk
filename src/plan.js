/**
 * plan.js — 做题计划（#/plan）
 * 候选池 = CF 未完成 + 洛谷官方题单未通过，纯前端排序生成。
 * 进度只存本机 localStorage["algodesk.plan.v1"]，不外发。
 */
import { h, chip, ratingBadge, lgBadge, progress } from './ui.js';
import { tagCN } from './i18n.js';

const KEY = 'algodesk.plan.v1';
const PER_DAY = 3;
const DAYS = 7;
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const LG_RATING = { 1: 800, 2: 1000, 3: 1200, 4: 1500, 5: 1800, 6: 2100, 7: 2400 };

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => ymd(new Date());
const wdOf = (s) => WD[new Date(`${s}T00:00:00`).getDay()] || '';
const shift = (s, n) => {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

function load() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    return p && Array.isArray(p.days) && p.days.length ? p : null;
  } catch {
    return null;
  }
}
function save(plan) {
  try {
    localStorage.setItem(KEY, JSON.stringify(plan));
  } catch {
    /* 隐私模式：进度不落盘，页面照常可用 */
  }
}

/** 候选池：tried 最优先 → 薄弱标签权重高 → 难度爬坡（rating 升序） */
export function buildCandidates(data) {
  const weak = new Map((data.summary.weakTags || []).map((t) => [t.tag, t.missing]));
  const cfU = (data.cf?.unsolved || []).map((p) => ({ ...p, key: `cf:${p.contestId}${p.index}`, isLG: false }));
  const lgU = (data.luogu?.trainings || []).flatMap((t) =>
    (t.problems || [])
      .filter((p) => p.passed === false)
      .map((p) => ({
        key: `lg:${p.pid}`,
        name: p.name,
        url: p.url,
        pid: p.pid,
        difficulty: p.difficulty,
        rating: LG_RATING[p.difficulty] || 1000,
        tags: p.tags || [],
        status: 'todo',
        isLG: true,
      })),
  );
  const weakScore = (p) => (p.tags || []).reduce((a, t) => a + (weak.get(t) || 0), 0);
  return [...cfU, ...lgU].sort(
    (a, b) =>
      (a.status === 'tried' ? 0 : 1) - (b.status === 'tried' ? 0 : 1) ||
      weakScore(b) - weakScore(a) ||
      (a.rating ?? 9999) - (b.rating ?? 9999),
  );
}

const toRef = (c) => ({ key: c.key, name: c.name, url: c.url, done: false });

/** 重新排：保留已完成，其余槽位按最新排序补满 */
function regenerate(data, prev) {
  const keep = prev?.days?.map((d) => d.items.filter((i) => i.done)) || [];
  const used = new Set(keep.flat().map((i) => i.key));
  const pool = buildCandidates(data).filter((c) => !used.has(c.key));
  let idx = 0;
  const days = [];
  for (let d = 0; d < DAYS; d++) {
    const date = shift(today(), d);
    const items = keep[d] || [];
    while (items.length < PER_DAY && idx < pool.length) items.push(toRef(pool[idx++]));
    days.push({ date, items });
  }
  return { createdAt: prev?.createdAt || Date.now(), days };
}

function streakOf(plan) {
  const hit = new Set(plan.days.filter((d) => d.items.some((i) => i.done)).map((d) => d.date));
  if (!hit.size) return 0;
  let cur = hit.has(today()) ? today() : shift(today(), -1);
  let n = 0;
  while (hit.has(cur)) {
    n++;
    cur = shift(cur, -1);
  }
  return n;
}

/** 给 AI 的一句话今日计划摘要 */
export function planStatus(data) {
  const plan = load() || regenerate(data);
  const day = plan.days.find((d) => d.date === today());
  if (!day?.items.length) return '今日没有排题。';
  return `今日计划：${day.items.map((i) => `${i.done ? '[完成]' : i.skipped ? '[跳过]' : '[待做]'}${i.key}《${i.name}》`).join('、')}。`;
}

function planRow(item, poolMap, onDone, onSkip) {
  const d = poolMap.get(item.key) || item;
  const done = !!item.done;
  const skipped = !!item.skipped;
  const id = d.pid || (d.contestId != null ? `${d.contestId}${d.index}` : '—');
  return h(
    'div',
    { class: `prob-row plan-row${done ? ' is-done' : ''}${skipped ? ' is-skip' : ''}` },
    h(
      'a',
      { class: 'prob', href: d.url || '#', target: '_blank', rel: 'noreferrer' },
      h('span', { class: `dot ${done ? 'ok' : d.status === 'tried' ? 'tried' : 'todo'}` }),
      h('span', { class: 'prob-id' }, id),
      h('span', { class: 'prob-name' }, d.name || item.key),
      d.isLG
        ? d.difficulty
          ? lgBadge(d.difficulty)
          : h('span', { class: 'badge unrated' }, '—')
        : d.rating != null
          ? ratingBadge(d.rating)
          : h('span', { class: 'badge unrated' }, '—'),
      h('span', { class: 'prob-tags' }, (d.tags || []).slice(0, 2).map((t) => chip(tagCN(t), 'ghost'))),
      h('span', { class: 'prob-src' }, d.contestName || ''),
      h('span', { class: 'prob-tries' }, done ? '✔ 已完成' : skipped ? '已跳过' : ''),
      h('span', { class: 'prob-verdict' }),
    ),
    h(
      'span',
      { class: 'prob-actions' },
      h('button', { class: 'mini-btn plan-done', type: 'button', onClick: () => onDone(item) }, done ? '撤销' : '完成'),
      skipped || done ? null : h('button', { class: 'mini-btn plan-skip', type: 'button', onClick: () => onSkip(item) }, '跳过'),
    ),
  );
}

export function planView(data) {
  const pool = buildCandidates(data);
  const poolMap = new Map(pool.map((c) => [c.key, c]));
  let plan = load();
  if (!plan || plan.days.every((d) => d.date < today())) {
    plan = regenerate(data, plan);
    save(plan);
  }

  const body = h('div', { class: 'stack' });

  const usedKeys = () => new Set(plan.days.flatMap((d) => d.items.map((i) => i.key)));
  const findSwap = (item) => {
    const d = poolMap.get(item.key);
    const used = usedKeys();
    const left = () => pool.filter((c) => !used.has(c.key));
    if (d) {
      const tags = new Set(d.tags || []);
      const near = (c) => Math.abs((c.rating ?? 9999) - (d.rating ?? 9999)) <= 300;
      return (
        left().find((c) => (c.tags || []).some((t) => tags.has(t)) && near(c)) ||
        left().find(near) ||
        left()[0] ||
        null
      );
    }
    return left()[0] || null;
  };
  const onDone = (item) => {
    item.done = !item.done;
    if (item.done) item.skipped = false;
    redraw();
  };
  const onSkip = (item) => {
    item.skipped = true;
    const day = plan.days.find((d) => d.items.includes(item));
    const cand = findSwap(item);
    if (cand && day) day.items.push(toRef(cand));
    redraw();
  };

  function render() {
    const all = plan.days.flatMap((d) => d.items);
    const doneN = all.filter((i) => i.done).length;
    const elapsed = Math.min(DAYS, Math.max(1, Math.round((Date.now() - (plan.createdAt || Date.now())) / 864e5) + 1));

    return [
      h(
        'section',
        { class: 'card plan-top' },
        h(
          'div',
          { class: 'plan-top-line' },
          h(
            'div',
            {},
            h('h2', {}, '本周进度'),
            h('p', { class: 'muted' }, `完成 ${doneN} / ${all.length} 题 · 连续打卡 ${streakOf(plan)} 天`),
          ),
          h(
            'button',
            {
              class: 'btn ghost',
              type: 'button',
              onClick: () => {
                plan = regenerate(data, plan);
                redraw();
              },
            },
            '重新生成',
          ),
        ),
        progress(doneN, all.length, doneN === all.length && all.length ? 'ok' : ''),
      ),

      ...plan.days.map((d) =>
        h(
          'section',
          { class: 'card plan-day' },
          h(
            'div',
            { class: 'plan-day-head' },
            h('b', {}, `${d.date.slice(5).replace('-', '/')} ${wdOf(d.date)}`),
            d.date === today() ? chip('今天', 'accent') : null,
            h('span', { class: 'plan-day-num mono' }, `${d.items.filter((i) => i.done).length}/${d.items.length}`),
          ),
          ...d.items.map((it) => planRow(it, poolMap, onDone, onSkip)),
        ),
      ),

      importCard(),

      h(
        'section',
        { class: 'card' },
        h(
          'div',
          { class: 'plan-stats' },
          h('span', {}, `累计完成 ${doneN} 题`),
          h('span', {}, `平均每天 ${(doneN / elapsed).toFixed(1)} 题`),
          h('span', {}, `连续 ${streakOf(plan)} 天`),
        ),
      ),
    ];
  }

  function importCard() {
    const ta = h('textarea', {
      class: 'input plan-ta',
      rows: 5,
      placeholder: '{"days":[{"date":"2026-10-28","items":[{"pid":"P1001","name":"A+B Problem"}]}]}',
    });
    const err = h('div', { class: 'plan-err' });
    const doImport = () => {
      let j;
      try {
        j = JSON.parse(ta.value);
      } catch {
        err.textContent = '导入失败：不是合法的 JSON，检查引号和括号。页面保持原样。';
        return;
      }
      try {
        if (!j || !Array.isArray(j.days) || !j.days.length) throw new Error('days 必须是非空数组');
        const days = j.days.map((d) => {
          if (!d || typeof d.date !== 'string') throw new Error('每天要有 date');
          const items = (Array.isArray(d.items) ? d.items : []).map((it) => {
            if (!it || typeof it.pid !== 'string' || typeof it.name !== 'string') throw new Error('每题要有 pid 和 name');
            return { key: `lg:${it.pid}`, name: it.name, url: `https://www.luogu.com.cn/problem/${it.pid}`, isLG: true, done: false };
          });
          if (!items.length) throw new Error('每天有非空的 items');
          return { date: d.date, items };
        });
        plan = { createdAt: Date.now(), days };
        save(plan);
        err.textContent = '';
        redraw();
      } catch (e) {
        err.textContent = `导入失败：${e.message || 'JSON 格式不对'}，页面保持原样。`;
      }
    };
    return h(
      'section',
      { class: 'card plan-import' },
      sectionHeadLite('导入计划', '覆盖本地计划；洛谷个人计划需要登录、没有公开接口，这里是离线版，如需同步请在洛谷导出后粘贴。'),
      ta,
      h('div', { class: 'plan-import-row' }, h('button', { class: 'btn', type: 'button', onClick: doImport }, '导入'), err),
    );
  }

  const redraw = () => {
    save(plan);
    body.replaceChildren(...render());
  };
  redraw();
  return body;
}

function sectionHeadLite(title, desc) {
  return h(
    'div',
    { class: 'sec-head' },
    h('div', {}, h('h2', {}, title), h('p', { class: 'sec-desc' }, desc)),
  );
}
