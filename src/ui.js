/**
 * ui.js — 极简 DOM 助手 + 格式化 + 公共组件
 * 不引入框架，保证产物轻、加载快、可长期维护。
 */
import { tagCN, verdictCN, verdictFull } from './i18n.js';

/** 创建元素：h('div', { class: 'x', onClick: fn }, child...) */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(9)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const pad = (n) => String(n).padStart(2, '0');

/** 秒级时间戳 → 2026-10-28 22:35 */
export function fmtDate(sec, withTime = true) {
  if (!sec) return '—';
  const d = new Date(sec * 1000);
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${md} ${pad(d.getHours())}:${pad(d.getMinutes())}` : md;
}

export function fmtFull(sec) {
  if (!sec) return '—';
  const d = new Date(sec * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDuration(sec) {
  if (!sec) return '—';
  const h2 = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h2 ? (m ? `${h2}h${m}m` : `${h2}h`) : `${m}m`;
}

/** 剩余时间文案 */
export function remain(sec) {
  const diff = Math.floor(sec - Date.now() / 1000);
  if (diff <= 0) return '进行中 / 已开始';
  const d = Math.floor(diff / 86400);
  const hh = Math.floor((diff % 86400) / 3600);
  const mm = Math.floor((diff % 3600) / 60);
  const ss = diff % 60;
  if (d > 0) return `${d}天 ${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

const RATING_TIERS = [
  [2400, 'lg', 'red'],
  [2100, 'orange', 'orange'],
  [1900, 'purple', 'purple'],
  [1600, 'blue', 'blue'],
  [1400, 'cyan', 'cyan'],
  [1200, 'green', 'green'],
  [0, 'gray', 'gray'],
];

export function ratingClass(r) {
  if (!r) return 'gray';
  return RATING_TIERS.find(([min]) => r >= min)[1];
}

/** 洛谷难度 1–7 */
export const LG_DIFF = {
  1: { label: '入门', cls: 'lg1' },
  2: { label: '普及-', cls: 'lg2' },
  3: { label: '普及/提高-', cls: 'lg3' },
  4: { label: '普及+/提高', cls: 'lg4' },
  5: { label: '提高+/省选-', cls: 'lg5' },
  6: { label: '省选/NOI-', cls: 'lg6' },
  7: { label: 'NOI/CTF', cls: 'lg7' },
};

export const VERDICT_LABEL = { WA: 'WA', TLE: 'TLE', MLE: 'MLE', RE: 'RE', CE: 'CE', '部分分': '部分分' };

export function chip(text, kind = '') {
  return h('span', { class: `chip ${kind}`.trim() }, text);
}

/** 头像：加载失败时退化成首字母 */
export function avatarEl(src, name) {
  const fallback = () => h('div', { class: 'avatar fallback' }, (name || '?')[0].toUpperCase());
  if (!src) return fallback();
  const img = h('img', {
    class: 'avatar',
    src,
    alt: name,
    loading: 'lazy',
    referrerPolicy: 'no-referrer',
    onError: () => img.replaceWith(fallback()),
  });
  return img;
}

export function ratingBadge(r) {
  if (r == null) return h('span', { class: 'badge unrated' }, '未定级');
  return h('span', { class: `badge ${ratingClass(r)}` }, String(r));
}

export function lgBadge(d) {
  const info = LG_DIFF[d] || { label: '未定级', cls: 'lg0' };
  return h('span', { class: `badge ${info.cls}` }, info.label);
}

/** 进度条 */
export function progress(done, total, cls = '') {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return h(
    'div',
    { class: `progress ${cls}`.trim(), title: `${done}/${total}` },
    h('i', { style: { width: pct + '%' } }),
  );
}

export function statCard(label, value, sub, kind = '') {
  return h(
    'div',
    { class: `card stat ${kind}`.trim() },
    h('div', { class: 'stat-label' }, label),
    h('div', { class: 'stat-value' }, value),
    sub ? h('div', { class: 'stat-sub' }, sub) : null,
  );
}

export function sectionHead(title, desc, extra) {
  return h(
    'div',
    { class: 'sec-head' },
    h('div', {}, h('h2', {}, title), desc ? h('p', { class: 'sec-desc' }, desc) : null),
    extra || null,
  );
}

/** 最近点过的题（给 AI 上下文用，不拦截跳转） */
let lastProb = null;
export const getProb = () => lastProb;

/**
 * 题目行 —— 整行可点，直接进入可提交页面
 * cf:   题干页 / 右侧提交按钮到 /contest/{id}/submit
 * luogu: 题目页自带提交框
 */
export function probRow(p, { showContest = true } = {}) {
  const isLG = !!p.pid;
  const url = p.url;
  const submitUrl = isLG
    ? url // 洛谷题目页自带提交框
    : `https://codeforces.com/${p.contestId >= 100000 ? 'gym' : 'contest'}/${p.contestId}/submit`;
  const statusDot =
    p.status === 'ok' ? 'ok' : p.status === 'tried' ? 'tried' : isLG && p.passed ? 'ok' : 'todo';
  const showVerdict = p.lastVerdict && p.lastVerdict !== '跳过' && p.status !== 'ok';

  // 行与「提交」是兄弟节点（不用嵌套 <a>）：整行进题面，按钮进提交，中键/Ctrl 各自能开新标签
  return h(
    'div',
    { class: 'prob-row' },
    h(
      'a',
      { class: 'prob', href: url, target: '_blank', rel: 'noreferrer', title: `在 ${isLG ? '洛谷' : 'Codeforces'} 打开`, onClick: () => (lastProb = p) },
      h('span', { class: `dot ${statusDot}` }),
      h('span', { class: 'prob-id' }, isLG ? p.pid : `${p.contestId ?? ''}${p.index ?? ''}`),
      h('span', { class: 'prob-name' }, p.name),
      isLG ? lgBadge(p.difficulty) : ratingBadge(p.rating),
      h(
        'span',
        { class: 'prob-tags' },
        (p.tags || []).slice(0, 2).map((t) => chip(tagCN(t), 'ghost')),
        (p.tags || []).length > 2 ? chip(`+${p.tags.length - 2}`, 'ghost') : null,
      ),
      h('span', { class: 'prob-src' }, showContest && p.contestName ? p.contestName.replace(/^Codeforces (Round|Educational)/, '$1') : ''),
      h('span', { class: 'prob-tries' }, p.tries > 1 ? `${p.tries} 次` : ''),
      h(
        'span',
        { class: 'prob-verdict' },
        showVerdict ? h('span', { class: 'chip bad', title: verdictFull(p.lastVerdict) }, verdictCN(p.lastVerdict)) : '',
      ),
    ),
    h(
      'a',
      { class: 'mini-btn', href: submitUrl, target: '_blank', rel: 'noreferrer', title: '直接进入提交页' },
      '提交',
    ),
  );
}

/** 每秒刷新的倒计时 */
export function mountCountdowns(root = document) {
  const tick = () => {
    for (const el of root.querySelectorAll('[data-countdown]')) {
      const ts = Number(el.dataset.countdown);
      el.textContent = remain(ts);
    }
  };
  tick();
  clearInterval(mountCountdowns._t);
  mountCountdowns._t = setInterval(tick, 1000);
}

/** 字符串拼进 SVG 前转义 */
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * 全局悬停提示：任何元素加 data-tip="…" 即显示跟随鼠标的气泡（含 SVG）。
 * 用事件委托，动态重渲染的元素无需重新绑定。
 */
export function initTips() {
  const tip = h('div', { class: 'tip' });
  document.body.append(tip);
  let cur = null;
  const place = (e) => {
    const gap = 12;
    const r = tip.getBoundingClientRect();
    let x = e.clientX + gap;
    let y = e.clientY + gap;
    if (x + r.width > window.innerWidth - 6) x = e.clientX - r.width - gap;
    if (y + r.height > window.innerHeight - 6) y = e.clientY - r.height - gap;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  };
  document.addEventListener('pointerover', (e) => {
    const t = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
    if (!t || t === cur) return;
    cur = t;
    tip.textContent = t.getAttribute('data-tip');
    tip.classList.add('on');
    place(e);
  });
  document.addEventListener('pointermove', (e) => {
    if (cur) place(e);
  });
  document.addEventListener('pointerout', (e) => {
    if (cur && !(e.relatedTarget && cur.contains(e.relatedTarget))) {
      cur = null;
      tip.classList.remove('on');
    }
  });
}

/** 折线图（rating 曲线） */
export function lineChart(points, { width = 640, height = 160, pad = 24 } = {}) {
  if (!points.length) return h('div', { class: 'empty' }, '暂无数据');
  const ys = points.map((p) => p.v);
  const min = Math.min(...ys) - 30;
  const max = Math.max(...ys) + 30;
  const x = (i) => pad + (i * (width - pad * 2)) / Math.max(1, points.length - 1);
  const y = (v) => height - pad - ((v - min) / Math.max(1, max - min)) * (height - pad * 2);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height - pad} L${pad},${height - pad} Z`;
  // 每题两层：大的透明命中圈带 data-tip，小实心点只做展示并在悬停时放大
  const dots = points
    .map((p, i) => {
      const cx = x(i).toFixed(1);
      const cy = y(p.v).toFixed(1);
      const tipAttr = `data-tip="${esc(`${p.label}：${p.old == null ? p.v : `${p.old} → ${p.v}`}`)}"`;
      return `<circle cx="${cx}" cy="${cy}" r="9" class="chart-hit" ${tipAttr}/><circle cx="${cx}" cy="${cy}" r="3" class="chart-dot"/>`;
    })
    .join('');
  const last = points[points.length - 1];
  return h('div', { class: 'chart', html: `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="rating 曲线">
      <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4ea1ff" stop-opacity=".35"/>
        <stop offset="100%" stop-color="#4ea1ff" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#g1)"/>
      <path d="${line}" class="chart-line" pathLength="1" fill="none" stroke="#4ea1ff" stroke-width="2" stroke-linejoin="round"/>
      ${dots}
      <text x="${pad}" y="14" class="chart-label">${max}</text>
      <text x="${pad}" y="${height - 4}" class="chart-label">${min}</text>
    </svg>
    <div class="chart-foot"><span>最近 ${points.length} 场</span><b class="mono ${ratingClass(last.v)}">${last.v}</b></div>` });
}
