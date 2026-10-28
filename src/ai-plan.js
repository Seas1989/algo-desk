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
 * @returns {{days: Array<{date:string, items:Array}>, dropped:number, used:number, total:number}}
 */
export async function generatePlan({ data, box, requirement, days = 7, perDay = 3 }) {
  const cfg = loadCfg();
  if (!cfg.apiKey || !cfg.baseURL) {
    throw new Error('还没配置 AI：点右下角 AI 按钮 → 设置，填 API 地址、Key、模型。');
  }

  const pool = buildPool(data, box);
  if (!pool.length) throw new Error('候选池是空的：先去「比赛」或「题单」页看看有没有欠的题。');

  const { lines, keys, total, used } = poolForAI(pool, { limit: 60 });

  const system = [
    '你是算法竞赛教练，负责排训练计划。',
    `只能从用户给的候选题目里挑，返回的 key 必须逐字照抄，不许自己编题号。`,
    `总共排 ${days} 天，每天 ${perDay} 题，难度从易到难推进，同一天尽量不要同一个标签。`,
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

  for (const [i, d] of (parsed.days || []).entries()) {
    const { items, bad } = pickByKeys(pool, Array.isArray(d.items) ? d.items : []);
    dropped += bad.length;
    const uniq = items.filter((p) => (seen.has(p.key) ? false : seen.add(p.key)));
    if (!uniq.length) continue;
    outDays.push({
      date: usableDate(d.date, i),
      items: uniq.map((p) => ({
        key: p.key,
        name: p.name,
        url: p.url,
        isLG: p.isLG,
        done: false,
      })),
    });
  }

  if (!outDays.length) throw new Error('AI 返回的题号一个都对不上候选池，换个说法再试。');

  return { days: outDays, dropped, used, total };
}
