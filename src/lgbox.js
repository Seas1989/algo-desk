/**
 * lgbox.js — 洛谷首页那栏「任务计划」的小卡片
 *
 * 洛谷没有开放接口，首页又有 JS 反爬（脚本拿到的是 345 字节的挑战页），
 * 所以这里不走自动抓取：用户把侧栏那段文字整段复制粘贴，我们解析成题目列表。
 * 数据只存本机 localStorage，不外发。
 */
import { h, chip } from './ui.js';

const KEY = 'algodesk.lgbox.v1';

/* 洛谷题号：P / B 是洛谷自有题库，CF 开头是镜像的 Codeforces 题 */
const PID_RE = /\b(P\d{4,7}|B\d{4,7}|CF\d{1,4}[A-Z][0-9]?)\b/i;

/**
 * 解析「任务计划」侧栏复制出来的文本。一行一题，带 ✓ 的是已完成：
 *   ✓P1449 后缀表达式
 *   P2947 [USACO09MAR]Look Up S
 */
export function parseLuoguBoxText(text) {
  const out = [];
  const seen = new Set();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = PID_RE.exec(line);
    if (!m) continue;
    const pid = m[0].toUpperCase();
    if (seen.has(pid)) continue;
    seen.add(pid);
    out.push({
      pid,
      name: line.slice(m.index + m[0].length).replace(/^[\s\-–—:：]+/, '').trim() || pid,
      done: /[✓√✔☑]|已完成/.test(line),
      url: `https://www.luogu.com.cn/problem/${pid}`,
    });
  }
  return out;
}

export function loadBox() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null');
    return Array.isArray(j?.items) ? j : { items: [], importedAt: 0 };
  } catch {
    return { items: [], importedAt: 0 };
  }
}

export function saveBox(items) {
  const box = { items, importedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(box));
  } catch {
    /* 隐私模式：本次会话有效 */
  }
  return box;
}

export function toggleBoxItem(pid) {
  const box = loadBox();
  const it = box.items.find((x) => x.pid === pid);
  if (it) it.done = !it.done;
  return saveBox(box.items);
}

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} 更新`;
};

/**
 * 小栏卡片。窄栏里最多显示 6 条，其余折叠；改动后自己重画，不依赖外层刷新。
 */
export function luoguBoxCard({ limit = 6 } = {}) {
  const host = h('div', { class: 'lgbox-host' });
  const paint = () => host.replaceChildren(renderBox({ limit, paint }));
  paint();
  return host;
}

function renderBox({ limit, paint }) {
  const box = loadBox();
  const items = box.items;
  const done = items.filter((i) => i.done).length;

  const rows = items.slice(0, limit).map((it) => boxRow(it, paint));

  const ta = h('textarea', {
    class: 'input lgbox-ta',
    rows: 4,
    placeholder: '把洛谷首页右侧「任务计划」整段复制粘贴到这里，一行一题',
  });
  const msg = h('div', { class: 'plan-err' });
  const doImport = () => {
    const parsed = parseLuoguBoxText(ta.value);
    if (!parsed.length) {
      msg.textContent = '没认出题号，确认复制的是任务计划那段。';
      return;
    }
    saveBox(parsed);
    paint();
  };

  return h(
    'section',
    { class: 'card lgbox' },
    h(
      'div',
      { class: 'lgbox-head' },
      h('h3', {}, '洛谷 · 任务计划'),
      items.length ? h('span', { class: 'lgbox-count mono' }, `${done}/${items.length}`) : null,
    ),
    items.length
      ? h(
          'div',
          { class: 'lgbox-list' },
          rows,
          items.length > limit
            ? h(
                'details',
                { class: 'lgbox-more' },
                h('summary', {}, `还有 ${items.length - limit} 题`),
                items.slice(limit).map((it) => boxRow(it, paint)),
              )
            : null,
        )
      : h('p', { class: 'lgbox-empty' }, '还没有导入。洛谷首页右侧那栏复制过来就行。'),
    h(
      'details',
      { class: 'lgbox-import' },
      h('summary', {}, items.length ? '重新导入 / 编辑' : '导入'),
      ta,
      h('div', { class: 'plan-import-row' }, h('button', { class: 'btn small', type: 'button', onClick: doImport }, '解析并保存'), msg),
    ),
    items.length ? h('div', { class: 'lgbox-foot muted' }, fmtDate(box.importedAt)) : null,
  );
}

/** 一行：左边勾选框（可点），右边题名（点击进洛谷） */
function boxRow(it, paint) {
  return h(
    'div',
    { class: `lgbox-row${it.done ? ' is-done' : ''}` },
    h(
      'button',
      {
        class: 'lgbox-check',
        type: 'button',
        title: it.done ? '标记为未完成' : '标记为已完成',
        onClick: () => {
          toggleBoxItem(it.pid);
          paint();
        },
      },
      it.done ? '✓' : '',
    ),
    h('a', { class: 'lgbox-name', href: it.url, target: '_blank', rel: 'noreferrer', title: `${it.pid} ${it.name}` }, it.name),
  );
}
