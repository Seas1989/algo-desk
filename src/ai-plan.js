/**
 * ai-plan.js — 让接入的 AI 按用户要求排计划
 *
 * 用的是 AI 面板里配置的同一份凭据（localStorage["algodesk.ai"]），
 * 所以用户配过一次就不用再配。Key 只在浏览器里，直连服务商。
 *
 * 关键约束：AI 只能从 problem-agent 给的候选池里挑，返回的 key 逐个校验，
 * 编出来的题号一律丢掉——计划里出现不存在的题比排得丑严重得多。
 */
import { buildPool, poolForAI, pickByKeys } from './problem-agent.js';
import { TAG_CN, tagCN } from './i18n.js';

const CFG_KEY = 'algodesk.ai';

const pad = (n) => String(n).padStart(2, '0');
const dayStr = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * 计划页会把「所有日期都早于今天」的计划判定为过期并整份重排。
 * 模型经常吐出训练数据里的旧日期（2024 之类），那样排完就已经算过期，
 * 一离开页面再回来就被自动重排覆盖掉。所以只认今天及以后的日期，其余按顺序补。
 */
const todayStr = () => dayStr(0);
const usableDate = (s, i) => {
  const v = String(s || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= todayStr() ? v : dayStr(i);
};

export function aiReady() {
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
    return !!(c.apiKey && c.baseURL && c.model);
  } catch {
    return false;
  }
}

function loadCfg() {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
  } catch {
    return {};
  }
}

/** 从可能带 ```json 围栏的回复里抠出对象 */
function parseJson(text) {
  const raw = String(text || '').trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 没有返回 JSON');
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * 从「要求」里抠出明确约束。模型经常会忽略自然语言，所以这些约束我们自己也认一遍，
 * 认出来就直接作用在候选池上——它根本拿不到别的题，就谈不上「不听」。
 */
function parseConstraints(requirement, pool) {
  const txt = String(requirement || '');
  const lower = txt.toLowerCase();

  // 标签：中文名或英文名命中即算；只在池子里实际出现过的标签才算
  const present = new Set(pool.flatMap((p) => p.tags || []));
  const tags = [];
  for (const [en, cn] of Object.entries(TAG_CN)) {
    if (!present.has(en)) continue;
    if (txt.includes(cn) || lower.includes(en.toLowerCase())) tags.push(en);
  }

  // 难度上限：「不超过 1600」「1600 以下」「别超过 1600」
  const capMatch = /(?:不超过|别超过|不要超过|最高|上限|最多)\s*(\d{3,4})|(\d{3,4})\s*(?:分)?\s*(?:以下|以内|封顶)/.exec(txt);
  const maxRating = capMatch ? Number(capMatch[1] || capMatch[2]) : null;

  return { tags, maxRating, hasConstraint: tags.length > 0 || maxRating != null };
}

/** 按约束过滤候选池（洛谷题没有 CF rating，难度上限只对 CF 生效） */
function applyConstraints(pool, { tags, maxRating }) {
  return pool.filter((p) => {
    if (tags.length && !(p.tags || []).some((t) => tags.includes(t))) return false;
    if (maxRating != null && !p.isLG && p.rating != null && p.rating > maxRating) return false;
    return true;
  });
}

/* 题库结果缓存：一次会话内反复排计划不该重复拉 2MB */
let psCache = null;
const psCacheByTag = new Map();

/**
 * 从 Codeforces 题库里捞「没碰过」的题。
 * 有标签约束时走 ?tags=dp，响应很小；没约束才拉全量（约 2MB，只拉一次）。
 * 难度带取「自己 rating ±300」，再被用户写的上限压住。
 */
async function fetchFresh(data, cons, { cap = 40 } = {}) {
  const touched = new Set((data?.cf?.touched || []).map(String));
  const mine = Number(data?.summary?.cf?.rating || data?.cf?.rating || 1200);
  const lo = Math.max(800, mine - 300);
  const hi = cons.maxRating ? Math.min(cons.maxRating, mine + 300) : mine + 300;

  const tagKey = cons.tags.join(';');
  let probs = tagKey ? psCacheByTag.get(tagKey) : psCache;
  if (!probs) {
    try {
      const url = `https://codeforces.com/api/problemset.problems${tagKey ? `?tags=${encodeURIComponent(tagKey)}` : ''}`;
      const res = await fetch(url);
      const j = await res.json();
      probs = j?.result?.problems || [];
    } catch {
      probs = [];
    }
    if (tagKey) psCacheByTag.set(tagKey, probs);
    else psCache = probs;
  }

  const seen = new Set();
  const out = [];
  for (const p of probs) {
    if (!p.rating || p.rating < lo || p.rating > hi) continue;
    const key = `cf:${p.contestId}${p.index}`;
    if (touched.has(`${p.contestId}${p.index}`) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      source: 'new',
      pid: `${p.contestId}${p.index}`,
      name: p.name,
      rating: p.rating,
      tags: p.tags || [],
      status: 'new',
      isLG: false,
      url: `https://codeforces.com/${p.contestId >= 100000 ? 'gym' : 'contest'}/${p.contestId}/problem/${p.index}`,
    });
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * @returns {{days: Array<{date:string, items:Array}>, dropped:number, used:number, total:number}}
 */
export async function generatePlan({ data, box, requirement, days = 7, perDay = 3 }) {
  const cfg = loadCfg();
  if (!cfg.apiKey || !cfg.baseURL) {
    throw new Error('还没配置 AI：点右下角 AI 按钮 → 设置，填 API 地址、Key、模型。');
  }

  const all = buildPool(data, box);
  if (!all.length) throw new Error('候选池是空的：先去「比赛」或「题单」页看看有没有欠的题。');

  const daysN = Math.max(1, Math.min(30, Number(days) || 7));
  const perDayN = Math.max(1, Math.min(6, Number(perDay) || 3));
  const want = daysN * perDayN;

  const cons = parseConstraints(requirement, all);
  const filtered = cons.hasConstraint ? applyConstraints(all, cons) : all;

  // 没碰过的新题：CF 题库公开接口能按标签过滤；洛谷题库有反爬，拿不到
  const fresh = await fetchFresh(data, cons);
  const pool = fresh.length ? [...fresh, ...filtered] : filtered;

  if (!pool.length) {
    const why = [cons.tags.length ? `标签 ${cons.tags.map((t) => tagCN(t)).join('/')}` : '', cons.maxRating ? `难度 ≤ ${cons.maxRating}` : '']
      .filter(Boolean)
      .join('、');
    throw new Error(`按你的要求（${why}）筛完，候选池一道题都不剩。放宽一点条件，或者先去把那类题做几道。`);
  }

  if (pool.length < want) {
    // 池子不够就不要硬凑：把实际能排的说清楚
    const note = `符合条件只有 ${pool.length} 道，排不满 ${daysN}×${perDayN}`;
    return fillDeterministic({ pool, daysN, perDayN, note });
  }

  const { lines, total, used } = poolForAI(pool, { limit: 60 });

  const system = [
    '你是算法竞赛教练，负责排训练计划。',
    '只能从用户给的候选题目里挑，返回的 key 必须逐字照抄，不许自己编题号。',
    `必须排 ${daysN} 天，每天正好 ${perDayN} 题，一天不多一天不少。`,
    '难度从易到难推进，同一天尽量不重复同一个标签。',
    '只输出 JSON，不要解释、不要 markdown 围栏。格式：',
    '{"days":[{"date":"YYYY-MM-DD","items":["cf:1968A","lg:P1001"]}]}',
    '第一个日期是今天，依次往后排。',
  ].join('\n');

  const user = [
    `【候选题目】格式：key 难度 标签`,
    ...lines,
    '',
    `【用户要求】${requirement || '按你判断排，优先补薄弱标签，难度别跳太快'}`,
  ].join('\n');

  const res = await fetch(`${cfg.baseURL.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.4,
      max_tokens: 1200,
    }),
  });

  if (res.status === 401 || res.status === 403) throw new Error('API Key 无效。');
  if (res.status === 429) throw new Error('AI 接口限流了，等一会儿再试。');
  if (!res.ok) {
    // 把服务商的原话带出来，否则「HTTP 400」没法排查（多半是模型名写错）
    let detail = '';
    try {
      const t = await res.text();
      try {
        const j = JSON.parse(t);
        detail = j?.error?.message || j?.message || '';
      } catch {
        detail = t.slice(0, 140);
      }
    } catch {
      /* 忽略 */
    }
    throw new Error(
      `AI 请求失败（HTTP ${res.status}，模型 ${cfg.model}）${detail ? `：${detail}` : ''}${
        res.status === 400 ? '。检查模型名，DeepSeek 用 deepseek-chat。' : ''
      }`,
    );
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || '';
  const parsed = parseJson(text);

  let dropped = 0;
  const outDays = [];
  const seen = new Set();
  const spare = pool.filter((p) => true); // 备用池：AI 给少了就从这里按顺序补
  let spareIdx = 0;

  const toItem = (p) => ({ key: p.key, name: p.name, url: p.url, isLG: p.isLG, done: false });

  for (const [i, d] of (parsed.days || []).entries()) {
    if (outDays.length >= daysN) break; // 天数是硬约束，多给的天直接丢
    const { items, bad } = pickByKeys(pool, Array.isArray(d.items) ? d.items : []);
    dropped += bad.length;
    let uniq = items.filter((p) => (seen.has(p.key) ? false : seen.add(p.key)));

    // 每天正好 perDayN 题：多了截断，少了从池子里补
    if (uniq.length > perDayN) {
      for (const p of uniq.slice(perDayN)) seen.delete(p.key); // 截掉的题放回可用集合
      uniq = uniq.slice(0, perDayN);
    }
    while (uniq.length < perDayN) {
      while (spareIdx < spare.length && seen.has(spare[spareIdx].key)) spareIdx++;
      const p = spare[spareIdx++];
      if (!p) break;
      seen.add(p.key);
      uniq.push(p);
    }
    if (!uniq.length) continue;
    outDays.push({
      date: usableDate(d.date, outDays.length),
      items: uniq.map(toItem),
    });
  }

  if (!outDays.length) throw new Error('AI 返回的题号一个都对不上候选池，换个说法再试。');

  const note =
    outDays.length < daysN
      ? `符合条件的题只够排 ${outDays.length} 天（你要 ${daysN} 天），已按实际数量排。`
      : '';

  return { days: outDays, dropped, used, total, note };
}

/** 池子不够排满时，不调 AI，直接按难度顺序铺开 */
function fillDeterministic({ pool, daysN, perDayN, note }) {
  const out = [];
  let i = 0;
  for (let d = 0; d < daysN && i < pool.length; d++) {
    const items = [];
    for (let k = 0; k < perDayN && i < pool.length; k++, i++) {
      const p = pool[i];
      items.push({ key: p.key, name: p.name, url: p.url, isLG: p.isLG, done: false });
    }
    out.push({ date: dayStr(d), items });
  }
  return { days: out, dropped: 0, used: pool.length, total: pool.length, note };
}
