import './styles.css';
import { h, mountCountdowns, fmtDate } from './ui.js';
import * as views from './views.js';

const NAV = [
  { id: 'home', label: '总览' },
  { id: 'contests', label: '比赛' },
  { id: 'unsolved', label: '未完成题' },
  { id: 'lists', label: '题单' },
  { id: 'about', label: '关于' },
];

const dataBase = new URL('data/', location.href.replace(/[#?].*$/, ''));

let data = null;
let loadError = null;

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
  const main = h('main', { class: 'wrap' }, el);
  shell(main);
  mountCountdowns(main);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

window.addEventListener('hashchange', render);

(async function boot() {
  if (!document.getElementById('root')) document.body.append(h('div', { id: 'root' }));
  render();
  try {
    data = await loadData();
  } catch (e) {
    loadError = e;
  }
  render();
})();
