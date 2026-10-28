/**
 * plan.js — 做题计划（#/plan）
 * 候选池 = CF 未完成 + 洛谷官方题单未通过，纯前端排序生成。
 * 进度只存本机 localStorage["algodesk.plan.v1"]，不外发。
 */
import { h, chip, ratingBadge, lgBadge, progress } from './ui.js';
import { tagCN } from './i18n.js';
import { parseLuoguBoxText, luoguBoxCard, loadBox } from './lgbox.js';
import { generatePlan, aiReady } from './ai-plan.js';

const KEY = 'algodesk.plan.v1';
const AI_REQ_KEY = 'algodesk.plan.aiReq.v1';
/* 上一次生成的结果提示：redraw 会把卡片拆了重建，所以放外面存着 */
let lastAiMsg = '';
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

/** 上次写给 AI 的要求：排完不清空，下次直接在上面改 */
function loadAiReq() {
  try {
    const r = JSON.parse(localStorage.getItem(AI_REQ_KEY) || '{}');
    return { requirement: typeof r.requirement === 'string' ? r.requirement : '', days: r.days || DAYS, perDay: r.perDay || PER_DAY };
  } catch {
    return { requirement: '', days: DAYS, perDay: PER_DAY };
  }
}

function saveAiReq(v) {
  try {
    localStorage.setItem(AI_REQ_KEY, JSON.stringify({ ...v, at: Date.now() }));
  } catch {
    /* 隐私模式下本次会话有效 */
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


/** 把抓好的洛谷计划转成本地 plan 结构：有日期按日期分组，没有的今天起每天 3 题；已完成状态按题号保留 */
function fromLuoguPlan(prev, lg) {
  const doneKeys = new Set((prev?.days || []).flatMap((d) => d.items.filter((i) => i.done).map((i) => i.key)));
  const ref = (p) => ({
    key: `lg:${p.pid}`,
    name: p.name || p.pid,
    url: p.url || `https://www.luogu.com.cn/problem/${p.pid}`,
    isLG: true,
    // 洛谷那边已经打过勾的，直接算完成；本地勾过的也保留
    done: !!p.done || doneKeys.has(`lg:${p.pid}`),
  });
  const byDate = new Map();
  const undated = [];
  for (const p of lg.problems || []) {
    if (p.planDate) {
      if (!byDate.has(p.planDate)) byDate.set(p.planDate, []);
      byDate.get(p.planDate).push(ref(p));
    } else undated.push(ref(p));
  }
  const days = [...byDate.keys()].sort().map((date) => ({ date, items: byDate.get(date) }));
  for (let i = 0, d = 0; i < undated.length; d++) {
    const date = shift(today(), d);
    const chunk = undated.slice(i, i + PER_DAY);
    i += chunk.length;
    const ex = days.find((x) => x.date === date);
    if (ex) ex.items.push(...chunk);
    else days.push({ date, items: chunk });
  }
  if (!days.length) return null;
  return { createdAt: Date.now(), days };
}

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
  /* AI 排的计划不要因为「日期都过去了」就被悄悄重排：只要还有没做完的题就留着，
     否则用户会觉得「排好的计划一离开就没了」。 */
  const stale = plan && plan.days.every((d) => d.date < today());
  const stillHasWork = plan && plan.days.some((d) => d.items.some((i) => !i.done && !i.skipped));
  if (!plan || (stale && (plan.by !== 'ai' || !stillHasWork))) {
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

      luoguPlanCard(data),

      aiPlanCard(),

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

  /** 本地脚本抓好的洛谷做题计划（public/data/luogu-plan.json），一键排进来 */
  function luoguPlanCard(d) {
    const lg = d.luoguPlan;
    if (!lg?.problems?.length) return null;
    const dated = lg.problems.filter((p) => p.planDate).length;
    const msg = h('div', { class: 'plan-err' });
    return h(
      'section',
      { class: 'card plan-import' },
      sectionHeadLite(
        '洛谷做题计划',
        `本机脚本登录抓取，共 ${lg.problems.length} 题${dated ? `，其中 ${dated} 题带计划日期` : ''}。点按钮覆盖本地计划，已打勾的题会保持完成状态。`,
      ),
      h(
        'div',
        { class: 'plan-import-row' },
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onClick: () => {
              const next = fromLuoguPlan(plan, lg);
              if (!next) {
                msg.textContent = '转换失败：计划里没有可用的题。';
                return;
              }
              plan = next;
              msg.textContent = '';
              redraw();
            },
          },
          '按洛谷计划排进来',
        ),
        msg,
      ),
      h('p', { class: 'muted' }, `抓取时间：${(lg.fetchedAt || '').slice(0, 16).replace('T', ' ')}；更新请在仓库根目录跑 npm run fetch:plan。`),
    );
  }

  function aiPlanCard() {
    /* 上次写的要求留着：排完一次不要清空，下次在这上面改就行 */
    const req = loadAiReq();
    const ta = h('textarea', {
      class: 'input plan-ta',
      rows: 3,
      placeholder: '比如：这周只练动态规划和二分，每天 2 题，难度别超过 1600，卡过的题优先',
      value: req.requirement || '',
    });
    const dayIn = h('input', { class: 'input plan-num', type: 'number', min: 1, max: 30, value: req.days || 7 });
    const perIn = h('input', { class: 'input plan-num', type: 'number', min: 1, max: 6, value: req.perDay || 3 });
    const btn = h('button', { class: 'btn primary', type: 'button' }, '让 AI 排');
    // redraw 会把整张卡拆了重建，所以上一次的提示要存在卡片外面
    const msg = h('div', { class: 'plan-err' }, lastAiMsg);

    const remember = () =>
      saveAiReq({ requirement: ta.value, days: Number(dayIn.value) || 7, perDay: Number(perIn.value) || 3 });

    // 边改边存，就算没点「让 AI 排」，下次打开也还在
    ta.addEventListener('input', remember);
    dayIn.addEventListener('change', remember);
    perIn.addEventListener('change', remember);

    btn.addEventListener('click', async () => {
      msg.textContent = '';
      if (!aiReady()) {
        msg.textContent = '还没配 AI：点右下角「AI」按钮 → 设置，填 API 地址、Key、模型。';
        return;
      }
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = '正在排…';
      try {
        const r = await generatePlan({
          data,
          box: loadBox(),
          requirement: ta.value.trim(),
          days: Number(dayIn.value) || 7,
          perDay: Number(perIn.value) || 3,
        });
        plan = { createdAt: Date.now(), days: r.days, by: 'ai' };
        save(plan);
        remember(); // 要求存下来，redraw 之后能原样填回输入框
        lastAiMsg = `排好了：${r.days.length} 天，从 ${r.total} 道候选里选。${r.dropped ? `丢弃了 ${r.dropped} 个对不上的题号。` : ''}`;
        redraw();
      } catch (e) {
        lastAiMsg = e.message || '生成失败，换个说法再试。';
        msg.textContent = lastAiMsg;
      } finally {
        btn.disabled = false;
        btn.textContent = old;
      }
    });

    return h(
      'section',
      { class: 'card plan-ai' },
      sectionHeadLite('让 AI 排', '写清你要练什么、每天几题、难度上限；AI 只能从你的欠账和洛谷任务计划里挑题。'),
      ta,
      h(
        'div',
        { class: 'plan-ai-row' },
        h('label', { class: 'plan-ai-field' }, '天数', dayIn),
        h('label', { class: 'plan-ai-field' }, '每天', perIn, h('span', { class: 'muted' }, '题')),
        btn,
        msg,
      ),
    );
  }

  function importCard() {
    const ta = h('textarea', {
      class: 'input plan-ta',
      rows: 6,
      placeholder:
        '两种都行：\n1) 洛谷首页右侧「任务计划」整段复制粘贴（一行一题，带 ✓ 的是已完成）\n2) 或者粘贴 {"days":[{"date":"2026-10-28","items":[{"pid":"P1001","name":"A+B Problem"}]}]}',
    });
    const err = h('div', { class: 'plan-err' });

    const applyDays = (days) => {
      plan = { createdAt: Date.now(), days };
      save(plan);
      redraw();
    };

    const doImport = () => {
      const text = ta.value.trim();
      err.textContent = '';
      if (!text) {
        err.textContent = '先粘贴内容。';
        return;
      }

      // JSON 走原来的路径
      if (text.startsWith('{')) {
        let j;
        try {
          j = JSON.parse(text);
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
              return { key: `lg:${it.pid}`, name: it.name, url: `https://www.luogu.com.cn/problem/${it.pid}`, isLG: true, done: !!it.done };
            });
            if (!items.length) throw new Error('每天有非空的 items');
            return { date: d.date, items };
          });
          applyDays(days);
        } catch (e) {
          err.textContent = `导入失败：${e.message || 'JSON 格式不对'}，页面保持原样。`;
        }
        return;
      }

      // 其余按洛谷「任务计划」文本解析
      const items = parseLuoguBoxText(text);
      if (!items.length) {
        err.textContent = '没认出题号。粘贴的内容里要能看到 P1165、B3666、CF5E 这样的编号。';
        return;
      }
      const next = fromLuoguPlan(plan, { problems: items });
      if (!next) {
        err.textContent = '解析出来了，但排不出计划，检查一下内容。';
        return;
      }
      plan = next;
      save(plan);
      redraw();
      err.textContent = `导入 ${items.length} 题（其中 ${items.filter((i) => i.done).length} 题已完成），按每天 3 题铺开。`;
    };

    return h(
      'section',
      { class: 'card plan-import' },
      sectionHeadLite(
        '导入计划',
        '直接把洛谷首页右侧「任务计划」那段复制进来就行；也支持覆盖本地计划的 JSON（格式见占位提示）。',
      ),
      ta,
      h('div', { class: 'plan-import-row' }, h('button', { class: 'btn', type: 'button', onClick: doImport }, '导入'), err),
    );
  }

  const redraw = () => {
    save(plan);
    body.replaceChildren(...render().filter(Boolean)); // 卡片可能返回 null（没抓过洛谷计划），必须先滤掉
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
