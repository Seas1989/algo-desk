import './styles.css';
import { h, mountCountdowns, fmtDate, initTips } from './ui.js';
import { TAG_CN } from './i18n.js';
import * as views from './views.js';

const NAV = [
  { id: 'home', label: '总览' },
  { id: 'contests', label: '比赛' },
  { id: 'unsolved', label: '未完成题' },
  { id: 'plan', label: '做题计划' },
  { id: 'lists', label: '题单' },
  { id: 'about', label: '关于' },
];

const dataBase = new URL('data/', location.href.replace(/[#?].*$/, ''));

/* 主题：深色 / 浅色 / 跟随系统，写 localStorage 并打 data-theme */
const THEME_KEY = 'algodesk.theme';
const THEME_LABEL = { dark: '深色', light: '浅色', auto: '跟随系统' };
const getThemePref = () => {
  try {
    return localStorage.getItem(THEME_KEY) || 'auto';
  } catch {
    return 'auto';
  }
};
const applyTheme = (pref) => {
  const eff =
    pref === 'auto' && window.matchMedia
      ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : pref === 'auto'
        ? 'dark'
        : pref;
  document.documentElement.setAttribute('data-theme', eff);
};
applyTheme(getThemePref());
if (window.matchMedia) {
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => {
    if (getThemePref() === 'auto') applyTheme('auto');
  });
}
function themeButton() {
  let pref = getThemePref();
  const btn = h('button', { class: 'btn ghost theme-btn', type: 'button', title: '切换主题' }, `◐ ${THEME_LABEL[pref]}`);
  btn.addEventListener('click', () => {
    const order = ['dark', 'light', 'auto'];
    pref = order[(order.indexOf(pref) + 1) % order.length];
    try {
      localStorage.setItem(THEME_KEY, pref);
    } catch {
      /* 隐私模式下降级：只切当前会话 */
    }
    applyTheme(pref);
    btn.textContent = `◐ ${THEME_LABEL[pref]}`;
  });
  return btn;
}

let data = null;
let loadError = null;

/* 实时查 CF handle（仅 Codeforces，洛谷无开放接口） */
let liveHandle = null;
let liveError = null;
let liveLoading = false;
let liveBannerFn = null;
let lastQueryText = '';

/* 中文标签名 / 英文标签 → 数据里真实存在的 CF 标签 */
const CN2TAG = new Map(Object.entries(TAG_CN).map(([en, cn]) => [cn, en]));
const EN2TAG = new Map(Object.entries(TAG_CN).map(([en]) => [en.toLowerCase(), en]));
function matchTag(text) {
  const en = CN2TAG.get(text) || EN2TAG.get(text.toLowerCase());
  if (!en) return null;
  const avail = new Set((data?.cf?.byTag || []).map((t) => t.tag));
  return avail.has(en) ? en : null;
}

function goHash(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

/* 搜索分发：算法标签→筛选欠账；合法 handle→实时查；其余→题名关键字 */
function doSearch(raw) {
  const text = (raw || '').trim();
  lastQueryText = text;
  if (!text) {
    lastQueryText = '';
    return doQuery('');
  }
  const tagEn = matchTag(text);
  if (tagEn) return goHash(`#/unsolved?tag=${encodeURIComponent(tagEn)}`);
  if (/^[A-Za-z0-9_.-]{3,24}$/.test(text)) return doQuery(text);
  goHash(`#/unsolved?q=${encodeURIComponent(text)}`);
}

async function doQuery(handle) {
  handle = (handle || '').trim();
  const url = new URL(location.href);
  if (handle) url.searchParams.set('cf', handle);
  else url.searchParams.delete('cf');
  history.replaceState(null, '', url);
  if (!handle) {
    liveHandle = null;
    liveError = null;
    data = await loadData();
    render();
    return;
  }
  liveLoading = true;
  liveError = null;
  render();
  try {
    const mod = await import('./live.js'); // 按需加载，不进主包
    liveBannerFn = mod.liveBanner;
    await mod.applyLive(handle, data);
    liveHandle = handle;
  } catch (e) {
    liveError = e.message || String(e);
    liveHandle = null;
  } finally {
    liveLoading = false;
    render();
  }
}

function handleSearchBar() {
  const input = h('input', {
    class: 'input handle-input',
    type: 'text',
    placeholder: 'CF handle 或标签',
    title: '输入算法标签（如：贪心）筛选欠账；输入 CF handle 实时查询',
    value: liveHandle || lastQueryText || '',
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch(input.value);
  });
  const btn = h('button', { class: 'btn ghost', type: 'button' }, liveLoading ? '查询中…' : '查询');
  btn.disabled = liveLoading;
  btn.addEventListener('click', () => doSearch(input.value));
  return h('div', { class: 'handle-search' }, input, btn);
}

async function loadData() {
  const get = async (f) => {
    const res = await fetch(new URL(f, dataBase), { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${f} → HTTP ${res.status}`);
    return res.json();
  };
  const [summary, cf, luogu] = await Promise.all([get('summary.json'), get('cf.json'), get('luogu.json')]);
  return { summary, cf, luogu };
}

function currentRoute() {
  const id = location.hash.replace(/^#\/?/, '').split('?')[0];
  return NAV.some((n) => n.id === id) ? id : 'home';
}

function navBar() {
  return h(
    'header',
    { class: 'topbar' },
    h(
      'div',
      { class: 'topbar-inner' },
      h(
        'a',
        { class: 'brand', href: '#/home' },
        h('span', { class: 'brand-mark' }, '</>'),
        h('span', { class: 'brand-text' }, '算法训练台'),
      ),
      h(
        'nav',
        { class: 'nav' },
        NAV.map((n) =>
          h(
            'a',
            {
              class: `nav-link ${currentRoute() === n.id ? 'on' : ''}`,
              href: `#/${n.id}`,
              dataset: { nav: n.id },
            },
            n.label,
          ),
        ),
      ),
      h(
        'div',
        { class: 'topbar-right' },
        data ? h('span', { class: 'updated mono' }, `更新 ${fmtDate(Date.parse(data.summary.generatedAt) / 1000)}`) : null,
        handleSearchBar(),
        themeButton(),
        h('a', { class: 'btn ghost', href: 'https://www.luogu.com.cn', target: '_blank', rel: 'noreferrer' }, '洛谷 ↗'),
        h('a', { class: 'btn ghost', href: 'https://codeforces.com', target: '_blank', rel: 'noreferrer' }, 'Codeforces ↗'),
      ),
    ),
  );
}

function shell(content) {
  const root = document.getElementById('root');
  root.replaceChildren(navBar(), content);
  // 高亮当前导航
  for (const a of root.querySelectorAll('.nav-link')) {
    a.classList.toggle('on', a.dataset.nav === currentRoute());
  }
}

function render() {
  const route = currentRoute();
  if (!data) {
    shell(
      h(
        'main',
        { class: 'wrap' },
        loadError
          ? h(
              'div',
              { class: 'card error' },
              h('h2', {}, '数据没加载出来'),
              h('p', {}, loadError.message),
              h('p', { class: 'muted' }, '先在项目根目录跑一次抓取，再刷新：'),
              h('pre', { class: 'code' }, 'npm run fetch'),
            )
          : h('div', { class: 'card' }, h('p', { class: 'muted' }, '正在读取本地数据…')),
      ),
    );
    return;
  }

  const el = views[route](data);
  const main = h('main', { class: 'wrap page-in' }, liveBanner(), el);
  shell(main);
  mountCountdowns(main);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function liveBanner() {
  if (liveBannerFn) return liveBannerFn({ handle: liveHandle, error: liveError });
  // live.js 尚未加载时（连按需块都拉不下来）的短兜底
  if (liveError) return h('div', { class: 'card error' }, h('p', {}, '实时查询失败，请稍后重试'));
  return null;
}

window.addEventListener('hashchange', render);

/* AI 教练：点击时才拉 ai.js，不占主包 */
let aiReady = false;
function aiFab() {
  const btn = h('button', { class: 'ai-fab', type: 'button', title: 'AI 教练' }, 'AI');
  btn.addEventListener('click', async () => {
    if (!aiReady) {
      btn.disabled = true;
      try {
        const m = await import('./ai.js');
        m.openAI(() => data);
        aiReady = true;
      } catch {
        render();
      } finally {
        btn.disabled = false;
      }
    } else {
      import('./ai.js').then((m) => m.toggle());
    }
  });
  return btn;
}

(async function boot() {
  if (!document.getElementById('root')) document.body.append(h('div', { id: 'root' }));
  initTips();
  document.body.append(aiFab());
  render();
  try {
    data = await loadData();
  } catch (e) {
    loadError = e;
  }
  render();
  const cfParam = new URLSearchParams(location.search).get('cf');
  if (cfParam && !loadError) doQuery(cfParam);
})();
