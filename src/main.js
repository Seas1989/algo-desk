import './styles.css';
import './account.css';
import { h, mountCountdowns, fmtDate, initTips } from './ui.js';
import { TAG_CN } from './i18n.js';
import * as views from './views.js';
import { activeAccount, addAccount } from './accounts.js';
import { accountButton, openLogin } from './login.js';
import { guestLanding, guestPrompt } from './guest.js';

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

/* 站主快照：永远留一份，切换账号时当兜底 base，退出账号时回到它 */
let staticData = null;

/* 当前账号（null = 访客视图，看站主数据） */
let account = null;
let liveError = null;
let liveLoading = false;
let liveBannerFn = null;
let luoguMissing = false;
let lastQueryText = '';

/**
 * 应用一个账号：CF 走实时接口，洛谷读构建期快照。
 * 传 null 回到访客视图。不写 localStorage —— 保存账号是账号面板的事。
 */
async function applyAccount(acc) {
  account = acc || null;

  const url = new URL(location.href);
  if (account?.cf) url.searchParams.set('cf', account.cf);
  else url.searchParams.delete('cf');
  if (account?.luogu) url.searchParams.set('lg', account.luogu);
  else url.searchParams.delete('lg');
  history.replaceState(null, '', url);

  liveError = null;
  luoguMissing = false;

  if (!account) {
    liveBannerFn = null;
    data = staticData || (await loadData());
    render();
    return;
  }

  liveLoading = true;
  render();
  try {
    const mod = await import('./live.js'); // 按需加载，不进主包
    liveBannerFn = mod.accountBanner;
    const base = staticData || (await loadData());
    const next = await mod.loadAccount(account, base);
    data = next;
    luoguMissing = !!next.luoguMissing;
  } catch (e) {
    liveError = e.message || String(e);
    data = staticData || data;
  } finally {
    liveLoading = false;
    render();
  }
}

/* 搜索框里输入 handle = 快速看一眼（临时账号，不写进账号列表） */
async function doQuery(handle) {
  const v = (handle || '').trim();
  if (!v) return applyAccount(null);
  return applyAccount({ id: 'adhoc', cf: v, luogu: '', label: v, adhoc: true });
}

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

function handleSearchBar() {
  const input = h('input', {
    class: 'input handle-input',
    type: 'text',
    placeholder: 'CF handle 或标签',
    title: '输入算法标签（如：贪心）筛选欠账；输入 CF handle 实时查询',
    value: account?.cf || lastQueryText || '',
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
        accountButton({ onChange: () => applyAccount(activeAccount()) }),
        themeButton(),
        h('a', { class: 'btn ghost ext-link', href: 'https://www.luogu.com.cn', target: '_blank', rel: 'noreferrer' }, '洛谷 ↗'),
        h('a', { class: 'btn ghost ext-link', href: 'https://codeforces.com', target: '_blank', rel: 'noreferrer' }, 'Codeforces ↗'),
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
  const onAccountChange = () => applyAccount(activeAccount());
  syncFab();

  // 未登录：不展示、也不加载任何人的数据。「关于」页除外
  if (!account) {
    const el =
      route === 'about'
        ? views.about()
        : route === 'home'
          ? guestLanding({ onChange: onAccountChange })
          : guestPrompt(route, { onChange: onAccountChange });
    const main = h('main', { class: 'wrap page-in' }, el);
    shell(main);
    mountCountdowns(main);
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }

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
          : h('div', { class: 'card' }, h('p', { class: 'muted' }, '正在读取数据…')),
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
  if (liveBannerFn) return liveBannerFn({ account, error: liveError, luoguMissing });
  // live.js 尚未加载时（连按需块都拉不下来）的短兜底
  if (liveError) return h('div', { class: 'card error' }, h('p', {}, '拉取数据失败，请稍后重试'));
  return null;
}

/* AI 教练要有数据才有意义：访客不显示那个悬浮按钮 */
function syncFab() {
  const fab = document.querySelector('.ai-fab');
  if (fab) fab.style.display = account ? '' : 'none';
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

  // 先把访客视图渲出来（不发任何请求），有账号再去拉数据
  render();

  const sp = new URLSearchParams(location.search);
  const cfParam = sp.get('cf');
  const lgParam = sp.get('lg') || '';
  const target = cfParam
    ? { id: 'adhoc', cf: cfParam, luogu: lgParam, label: cfParam, adhoc: true }
    : activeAccount();

  if (target) applyAccount(target);

  // ?login=1 —— 分享一个「加账号」的链接，也方便第一次来的人直接落到登录框
  if (sp.get('login')) openLogin({ onChange: () => applyAccount(activeAccount()) });
})();
