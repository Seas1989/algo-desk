/**
 * views.js — 页面的渲染函数（计划页实现在 plan.js，这里统一导出）
 * 入参统一为 { summary, cf, luogu }
 */
import { tagCN, rankCN } from './i18n.js';
import {
  h,
  fmtDate,
  fmtFull,
  fmtDuration,
  chip,
  ratingBadge,
  lgBadge,
  progress,
  statCard,
  sectionHead,
  probRow,
  lineChart,
  ratingClass,
  avatarEl,
  LG_DIFF,
} from './ui.js';
import { planView } from './plan.js';

export function plan(data) {
  return planView(data);
}

const fmtDelta = (d) => (d == null ? '—' : `${d > 0 ? '+' : ''}${d}`);

/* ------------------------------------------------------------------ 总览 */
export function home({ summary: s, cf, luogu }) {
  const totalUnsolved = s.cf.unfinished + s.luogu.submitted;
  const heatMax = Math.max(1, ...s.heat.map((d) => d.count));
  const last7 = s.heat.slice(-7).reduce((a, d) => a + d.count, 0);

  return h(
    'div',
    { class: 'stack' },

    // 账号条
    h(
      'div',
      { class: 'hero' },
      h(
        'div',
        { class: 'hero-main' },
        h('div', { class: 'eyebrow' }, 'ALGORITHM DASHBOARD'),
        h('h1', {}, '算法训练台'),
        h(
          'p',
          { class: 'lede' },
          '把两边的账号、比赛和欠账的题放在一张桌子上。数据抓取于 ',
          h('span', { class: 'mono' }, fmtDate(Date.parse(s.generatedAt) / 1000)),
          '。',
        ),
      ),
      h(
        'div',
        { class: 'profiles' },
        profileCard('Codeforces', s.cf.handle, s.cf.avatar, `${s.cf.rating}`, `最高 ${s.cf.maxRating}`, s.cf.rank, [
          `${s.cf.solved} 题`,
          `${s.cf.contests} 场`,
        ], `https://codeforces.com/profile/${s.cf.handle}`),
        profileCard('洛谷', s.luogu.name, s.luogu.avatar, `${s.luogu.rating}`, `排名 ${s.luogu.ranking}`, 'rating', [
          `${s.luogu.passed} 题`,
          `${s.luogu.trainings} 个题单`,
        ], `https://www.luogu.com.cn/user/${s.luogu.uid}`),
      ),
    ),

    // 关键数字
    h(
      'div',
      { class: 'grid-4' },
      statCard('CF 当前 Rating', String(s.cf.rating), `最高 ${s.cf.maxRating} · ${rankCN(s.cf.rank)}`, 'accent'),
      statCard('CF 已过题', String(s.cf.solved), `${s.cf.submissions} 次提交 · ${s.cf.halfDone} 场半途而废`),
      statCard('欠的题', String(totalUnsolved), `比赛未完成 ${s.cf.unfinished} · 洛谷 ${s.luogu.submitted}`, 'warn'),
      statCard('近 7 天提交', String(last7), '按 CF 提交统计', last7 ? 'ok' : 'muted'),
    ),

    // 曲线 + 热力
    h(
      'div',
      { class: 'grid-2' },
      h(
        'section',
        { class: 'card' },
        sectionHead('Rating 曲线', `${cf.ratingHistory.length} 场计入 rating 的比赛`),
        lineChart(
          cf.ratingHistory.map((r) => ({ v: r.now, old: r.old, label: `${r.name} (${fmtFull(Date.parse(r.time) / 1000)})` })),
        ),
        h(
          'div',
          { class: 'delta-row' },
          cf.ratingHistory.slice(-5).reverse().map((r) =>
            h(
              'span',
              { class: 'delta-item', 'data-tip': `${r.name}：${r.old} → ${r.now}（${rankCN(r.rank)}）` },
              chip(r.name.replace(/^Codeforces /, ''), 'ghost'),
              h('b', { class: r.now >= r.old ? 'up' : 'down' }, fmtDelta(r.now - r.old)),
            ),
          ),
        ),
      ),
      h(
        'section',
        { class: 'card' },
        sectionHead('训练热力', '近 90 天提交分布'),
        h(
          'div',
          { class: 'heat' },
          s.heat.map((d) => {
            const lv = d.count === 0 ? 0 : Math.min(4, Math.ceil((d.count / heatMax) * 4));
            return h('i', { class: `heat-cell lv${lv}`, 'data-tip': `${d.date} · ${d.count} 次提交` });
          }),
        ),
        h(
          'div',
          { class: 'heat-legend' },
          h('span', {}, '少'),
          [0, 1, 2, 3, 4].map((lv) => h('i', { class: `heat-cell lv${lv}` })),
          h('span', {}, '多'),
        ),
      ),
    ),

    // 今日建议
    sectionHead('今天从这里开始', '按「卡过的 → 该补的 → 新题单」排的优先级'),
    h(
      'div',
      { class: 'grid-3' },
      adviceCard(
        '补掉卡过的题',
        `${s.nextUp.cf.length} 题`,
        '比赛里提交过但没过，性价比最高',
        s.nextUp.cf.map((p) => probRow(p, { showContest: false })),
      ),
      adviceCard(
        '比赛里没动的题',
        `${s.nextUp.cfNew.length} 题`,
        '当时没时间做或来不及读题',
        s.nextUp.cfNew.map((p) => probRow(p, { showContest: false })),
      ),
      adviceCard(
        '洛谷题单下一步',
        `${s.luogu.trainings} 个题单`,
        '官方题单按顺序推，别跳',
        s.nextUp.training.map((t) =>
          h(
            'div',
            { class: 'next-item' },
            h('div', { class: 'next-title' }, t.name),
            t.next ? probRow({ ...t.next, status: 'todo' }) : h('div', { class: 'muted' }, '已全部完成 🎉'),
          ),
        ),
      ),
    ),

    // 薄弱点 + 题单进度
    h(
      'div',
      { class: 'grid-2' },
      h(
        'section',
        { class: 'card' },
        sectionHead('薄弱知识点', '未完成题里出现最多的标签，越靠前越该补'),
        h(
          'div',
          { class: 'bars' },
          s.weakTags.slice(0, 8).map((t) => {
            const max = s.weakTags[0].missing;
            return h(
              'div',
              { class: 'bar-row' },
              h('span', { class: 'bar-label' }, tagCN(t.tag)),
              h('span', { class: 'bar-track' }, h('i', { style: { width: (t.missing / max) * 100 + '%' } })),
              h('span', { class: 'bar-num mono' }, `${t.missing}`),
              h('span', { class: 'bar-sub' }, `已过 ${t.solved}`),
            );
          }),
        ),
      ),
      h(
        'section',
        { class: 'card' },
        sectionHead('洛谷题单进度', '官方题单，按顺序做完即可', h('a', { class: 'link', href: '#/lists' }, '全部题单 →')),
        h(
          'div',
          { class: 'list-compact' },
          luogu.trainings.slice(0, 5).map((t) =>
            h(
              'div',
              { class: 'training-line' },
              h('div', { class: 'tl-top' }, h('span', {}, t.name), h('span', { class: 'mono' }, `${t.done}/${t.problemCount}`)),
              progress(t.done, t.problemCount),
            ),
          ),
        ),
      ),
    ),
    lgDiffCard(luogu),
  );
}

function lgDiffCard(luogu) {
  const rows = luogu?.stats?.byDifficulty || [];
  const max = Math.max(1, ...rows.map((x) => x.count));
  const total = rows.reduce((a, x) => a + x.count, 0);
  return h(
    'div',
    { class: 'grid-2' },
    h(
      'section',
      { class: 'card' },
      sectionHead('洛谷难度分布', `已通过 ${total} 题在各难度档的数量`),
      h(
        'div',
        { class: 'bars' },
        rows.map((x) =>
          h(
            'div',
            { class: 'bar-row' },
            h('span', { class: 'bar-label' }, LG_DIFF[x.d]?.label || `${x.d} 级`),
            h('span', { class: 'bar-track' }, h('i', { class: 'lg', style: { width: (x.count / max) * 100 + '%' } })),
            h('span', { class: 'bar-num mono' }, String(x.count)),
            h('span', { class: 'bar-sub' }, x.count ? `${Math.round((x.count / total) * 100)}%` : ''),
          ),
        ),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      sectionHead('洛谷比赛记录', eloDesc(luogu)),
      luogu?.elo?.length
        ? h('div', { class: 'list-compact' }, luogu.elo.slice(0, 5).map(lgEloRow))
        : h('div', { class: 'empty' }, '还没有洛谷比赛记录'),
    ),
  );
}

function eloDesc(luogu) {
  const n = luogu?.elo?.length || 0;
  return n ? `最近 ${n} 场的 rating（最多显 5 场）` : '还没有洛谷比赛记录';
}

function profileCard(platform, name, avatar, big, sub, kind, chips, url) {
  return h(
    'a',
    { class: 'profile', href: url, target: '_blank', rel: 'noreferrer' },
    avatarEl(avatar, name),
    h(
      'div',
      { class: 'profile-body' },
      h('div', { class: 'profile-top' }, h('span', { class: 'platform' }, platform), h('span', { class: 'handle' }, name)),
      h('div', { class: 'profile-num' }, big, h('span', { class: 'unit' }, kind === 'rating' ? '' : '')),
      h('div', { class: 'profile-sub' }, sub),
      h('div', { class: 'profile-chips' }, chips.map((c) => chip(c, 'ghost'))),
    ),
  );
}

function adviceCard(title, badge, desc, children) {
  return h(
    'section',
    { class: 'card advice' },
    h('div', { class: 'advice-head' }, h('h3', {}, title), chip(badge, 'ghost')),
    h('p', { class: 'sec-desc' }, desc),
    h('div', { class: 'advice-body' }, children.length ? children : h('div', { class: 'muted' }, '暂无')),
  );
}

/* ------------------------------------------------------------------ 比赛 */
export function contests({ cf, luogu, summary: s }) {
  const participated = cf.contests;
  const halfDone = participated.filter((c) => c.halfDone);
  const rated = participated.filter((c) => c.rated).slice(0, 6);
  const net = rated.reduce((a, c) => a + (c.delta || 0), 0);
  const upN = rated.filter((c) => c.delta > 0).length;
  const avgSolved = rated.length ? (rated.reduce((a, c) => a + c.solved, 0) / rated.length).toFixed(1) : '0';
  const best = [...rated].sort((a, b) => (b.delta || 0) - (a.delta || 0))[0];
  const worst = [...rated].sort((a, b) => (a.delta || 0) - (b.delta || 0))[0];
  const weak = s.weakTags.slice(0, 3).map((t) => tagCN(t.tag)).join('、');

  return h(
    'div',
    { class: 'stack' },

    sectionHead(
      '即将开始',
      `共 ${cf.upcoming.length} 场。点卡片直接去 CF 报名页，开赛前 5 分钟提醒自己。`,
      h('a', { class: 'btn ghost', href: 'https://codeforces.com/contests', target: '_blank', rel: 'noreferrer' }, 'CF 比赛列表 ↗'),
    ),
    h(
      'div',
      { class: 'upcoming-grid' },
      cf.upcoming.map((c) =>
        h(
          'a',
          { class: 'card upcoming', href: c.url, target: '_blank', rel: 'noreferrer' },
          h('div', { class: 'up-top' }, h('span', { class: 'up-type' }, c.type === 'CF' ? 'CF' : 'ICPC/其他'), chip(fmtDuration(c.duration), 'ghost')),
          h('div', { class: 'up-name' }, c.name),
          h('div', { class: 'up-time mono' }, fmtDate(c.startTime)),
          h('div', { class: 'up-count', dataset: { countdown: c.startTime } }, '…'),
          h('div', { class: 'up-cta' }, '去报名 →'),
        ),
      ),
    ),

    sectionHead('洛谷 · 即将开始', luogu?.contests?.upcoming?.length ? `共 ${luogu.contests.upcoming.length} 场，报名在洛谷站内完成（本站只跳转）` : '近期没有公开的洛谷比赛'),
    luogu?.contests?.upcoming?.length
      ? h('div', { class: 'upcoming-grid' }, luogu.contests.upcoming.map(lgUpcomingCard))
      : null,

    sectionHead('最近比赛速览', '近 6 场计入 rating 的比赛，一句话看完状态', null),
    h(
      'section',
      { class: 'card digest' },
      h(
        'div',
        { class: 'digest-nums' },
        digestItem('近 6 场净变化', `${net >= 0 ? '+' : ''}${net}`, net >= 0 ? 'up' : 'down', `${upN} 涨 / ${rated.length - upN} 跌`),
        digestItem('场均过题', avgSolved, '', `共 ${rated.length} 场`),
        digestItem('最好一场', best ? `${best.delta > 0 ? '+' : ''}${best.delta}` : '—', 'up', best ? best.name.replace(/^Codeforces /, '') : ''),
        digestItem('最差一场', worst ? `${worst.delta}` : '—', 'down', worst ? worst.name.replace(/^Codeforces /, '') : ''),
      ),
      h(
        'p',
        { class: 'digest-text' },
        rated.length
          ? `最近 ${rated.length} 场：${upN} 场涨分、${rated.length - upN} 场掉分，净 ${net >= 0 ? '+' : ''}${net}，场均过 ${avgSolved} 题；涉及最多的薄弱点是 ${weak}。`
          : '还没有计入 rating 的比赛。',
      ),
    ),

    sectionHead('我的比赛', `共 ${participated.length} 场（${participated.filter((c) => c.rated).length} 场计 rating），其中 ${halfDone.length} 场没做完`),
    h(
      'div',
      { class: 'stack-sm' },
      participated.map(contestCard),
    ),

    sectionHead('我的洛谷比赛', luogu?.elo?.length ? `共 ${luogu.elo.length} 场，来自洛谷 rating 记录` : '还没有洛谷比赛记录'),
    luogu?.elo?.length ? h('div', { class: 'stack-sm' }, luogu.elo.map(lgEloRow)) : null,
  );
}

function lgUpcomingCard(c) {
  return h(
    'a',
    { class: 'card upcoming', href: c.url, target: '_blank', rel: 'noreferrer' },
    h(
      'div',
      { class: 'up-top' },
      h('span', { class: 'up-type' }, '洛谷'),
      chip(c.problemCount ? `${c.problemCount} 题` : '—', 'ghost'),
    ),
    h('div', { class: 'up-name' }, c.name),
    h('div', { class: 'up-time mono' }, fmtDate(c.startTime)),
    h('div', { class: 'up-count', dataset: { countdown: c.startTime } }, '…'),
    h('div', { class: 'up-cta' }, '去比赛 ↗'),
  );
}

function lgEloRow(e) {
  return h(
    'div',
    { class: 'card lg-elo' },
    h('span', { class: 'lg-elo-name' }, e.contest || '洛谷比赛'),
    h('span', { class: 'mono lg-elo-rating' }, e.rating == null ? '—' : String(e.rating)),
    h('span', { class: 'muted mono lg-elo-time' }, e.time ? fmtDate(Date.parse(e.time) / 1000) : '—'),
  );
}

function digestItem(label, value, cls, sub) {
  return h(
    'div',
    { class: 'digest-item' },
    h('div', { class: 'stat-label' }, label),
    h('div', { class: `digest-value ${cls}` }, value),
    h('div', { class: 'digest-sub' }, sub || ''),
  );
}

function contestCard(c) {
  // contest.list 的 type 字段不可靠（Div.3 也可能标成 ICPC），用题目集规模判断是否已知
  const known = c.total >= 3;
  const statusText = !known ? `已过 ${c.solved} 题` : c.solved === 0 ? '一题未过' : c.halfDone ? '半途而废' : '全部完成';
  const statusCls = !known ? '' : c.solved === 0 ? 'bad' : c.halfDone ? 'warn' : 'ok';

  return h(
    'details',
    { class: 'card contest' },
    h(
      'summary',
      { class: 'contest-summary' },
      h(
        'div',
        { class: 'cs-main' },
        h('div', { class: 'cs-title' }, h('a', { href: c.url, target: '_blank', rel: 'noreferrer', onClick: (e) => e.stopPropagation() }, c.name)),
        h(
          'div',
          { class: 'cs-meta' },
          h('span', {}, fmtDate(c.startTime)),
          c.rank ? h('span', {}, `排名 ${c.rank}`) : h('span', { class: 'muted' }, '未计入 rating'),
          c.delta != null ? h('span', { class: c.delta >= 0 ? 'up' : 'down' }, `${fmtDelta(c.delta)} rating`) : null,
        ),
      ),
      h(
        'div',
        { class: 'cs-right' },
        chip(statusText, statusCls),
        known ? h('span', { class: 'mono cs-score' }, `${c.solved}/${c.total}`) : null,
        known ? progress(c.solved, c.total, statusCls) : null,
      ),
      h(
        'a',
        { class: 'btn ghost cs-go', href: c.url, target: '_blank', rel: 'noreferrer', onClick: (e) => e.stopPropagation() },
        '去比赛 ↗',
      ),
    ),
    h(
      'div',
      { class: 'contest-body' },
      h('div', { class: 'contest-hint muted' }, '点题目进题面，点「提交」直达提交表单'),
      h(
        'div',
        { class: 'prob-grid' },
        c.problems.map((p) =>
          h(
            'a',
            {
              class: `pg ${p.status}`,
              href: p.url,
              target: '_blank',
              rel: 'noreferrer',
              title: `${p.index} ${p.name} · ${p.rating ?? '?'}`,
            },
            h('b', {}, p.index),
            h('span', {}, p.rating ?? '—'),
          ),
        ),
      ),
      h(
        'div',
        { class: 'contest-unsolved' },
        h('div', { class: 'mini-head' }, `未完成 ${c.unfinished} 题`),
        c.problems.filter((p) => p.status !== 'ok').map((p) => probRow(p, { showContest: false })),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ 未完成题 */
export function unsolved({ cf, luogu, summary: s }) {
  const sources = [
    { id: 'contest', label: '比赛未完成', count: cf.unsolved.length, items: cf.unsolved },
    { id: 'practice', label: '练习未过', count: cf.practiceUnsolved.length, items: cf.practiceUnsolved },
    { id: 'luogu', label: '洛谷未通过', count: luogu.unsolved.length, items: luogu.unsolved },
  ];

  const listBox = h('div', { class: 'stack-sm' });
  const filterBar = h('div', { class: 'filters' });
  // 支持 #/unsolved?tag=greedy / ?q=xxx 直达（顶栏搜标签会跳到这里）
  const hp = new URLSearchParams(location.hash.split('?')[1] || '');
  let active = 'contest';
  let query = hp.get('q') || '';
  let rating = 'all';
  let tag = hp.get('tag') || 'all';

  function items() {
    const base = sources.find((x) => x.id === active).items;
    return base.filter((p) => {
      if (query && !`${p.name} ${p.pid || ''} ${(p.tags || []).join(' ')}`.toLowerCase().includes(query.toLowerCase())) return false;
      if (rating !== 'all' && active !== 'luogu') {
        const r = p.rating ?? 0;
        const [lo, hi] = rating.split('-').map(Number);
        if (r < lo || r > hi) return false;
      }
      if (tag !== 'all' && !(p.tags || []).includes(tag)) return false;
      return true;
    });
  }

  function renderList() {
    const arr = items();
    listBox.replaceChildren(
      h('div', { class: 'result-count' }, `命中 ${arr.length} 题`),
      ...(arr.length
        ? arr.map((p) => probRow(p))
        : [h('div', { class: 'empty' }, '没有符合条件的题')]),
    );
  }

  function renderTabs() {
    const tabs = h(
      'div',
      { class: 'seg' },
      sources.map((sc) =>
        h(
          'button',
          {
            class: `seg-btn ${sc.id === active ? 'on' : ''}`,
            onClick: () => {
              active = sc.id;
              rating = 'all';
              tag = 'all';
              renderAll();
            },
          },
          sc.label,
          h('span', { class: 'seg-count' }, sc.count),
        ),
      ),
    );
    return tabs;
  }

  function renderFilters() {
    const tagOptions = ['all', ...cf.byTag.map((t) => t.tag)];
    filterBar.replaceChildren(
      h('input', {
        class: 'input',
        placeholder: '搜题名 / 题目号 / 标签',
        value: query,
        onInput: (e) => {
          query = e.target.value;
          renderList();
        },
      }),
      active !== 'luogu'
        ? h(
            'select',
            {
              class: 'input select',
              onChange: (e) => {
                rating = e.target.value;
                renderList();
              },
            },
            h('option', { value: 'all' }, '全部难度'),
            cf.byDifficulty.map((b) =>
              h('option', { value: `${b.min}-${b.max}` , selected: rating === `${b.min}-${b.max}` }, `${b.label}（${b.problems.length}）`),
            ),
          )
        : null,
      active === 'contest' || active === 'practice'
        ? h(
            'select',
            {
              class: 'input select',
              onChange: (e) => {
                tag = e.target.value;
                renderList();
              },
            },
            tagOptions.map((t) => h('option', { value: t, selected: tag === t }, t === 'all' ? '全部算法' : tagCN(t))),
          )
        : null,
    );
  }

  function renderAll() {
    renderTabsInto();
    renderFilters();
    renderList();
  }
  const tabsBox = h('div');
  function renderTabsInto() {
    tabsBox.replaceChildren(renderTabs());
  }

  renderAll();

  return h(
    'div',
    { class: 'stack' },
    sectionHead(
      '欠账清单',
      '比赛里没做完的题优先，其次是练习没过的。点一行直接进提交页。',
      h('div', { class: 'kpi-inline' }, h('b', {}, cf.unsolved.length + luogu.unsolved.length), ' 题待清'),
    ),
    tabsBox,
    filterBar,
    listBox,
  );
}

/* ------------------------------------------------------------------ 题单 */
export function lists({ cf, luogu }) {
  const modes = [
    { id: 'diff', label: 'CF · 按难度' },
    { id: 'tag', label: 'CF · 按算法' },
    { id: 'luogu', label: '洛谷 · 官方题单' },
  ];
  let mode = 'diff';
  let activeTag = cf.byTag[0]?.tag;

  const body = h('div', { class: 'stack-sm' });
  const tabs = h('div', { class: 'seg' });

  function renderTabs() {
    tabs.replaceChildren(
      ...modes.map((m) =>
        h(
          'button',
          {
            class: `seg-btn ${m.id === mode ? 'on' : ''}`,
            onClick: () => {
              mode = m.id;
              render();
            },
          },
          m.label,
        ),
      ),
    );
  }

  function renderBody() {
    if (mode === 'diff') {
      body.replaceChildren(
        ...cf.byDifficulty.map((b, i) =>
          h(
            'details',
            { class: 'card fold', open: i < 2 },
            h(
              'summary',
              { class: 'fold-summary' },
              h('span', { class: 'fold-title' }, b.label),
              h('span', { class: 'mono muted' }, `${b.problems.length} 题`),
            ),
            h('div', { class: 'fold-body' }, b.problems.map((p) => probRow(p))),
          ),
        ),
      );
      return;
    }
    if (mode === 'tag') {
      const cur = cf.byTag.find((t) => t.tag === activeTag) || cf.byTag[0];
      body.replaceChildren(
        h(
          'div',
          { class: 'tag-cloud' },
          cf.byTag.map((t) =>
            h(
              'button',
              {
                class: `tag-btn ${t.tag === cur.tag ? 'on' : ''}`,
                onClick: () => {
                  activeTag = t.tag;
                  render();
                },
              },
              tagCN(t.tag),
              h('span', { class: 'tag-count' }, t.count),
            ),
          ),
        ),
        h(
          'section',
          { class: 'card' },
          sectionHead(`${tagCN(cur.tag)}`, `${cur.count} 题，按难度升序`),
          cur.problems.map((p) => probRow(p)),
        ),
      );
      return;
    }
    body.replaceChildren(
      ...luogu.trainings.map((t) =>
        h(
          'details',
          { class: 'card fold' },
          h(
            'summary',
            { class: 'fold-summary' },
            h('span', { class: 'fold-title' }, t.name),
            h('span', { class: 'mono muted' }, `${t.problemCount} 题`),
            h('span', { class: 'fold-prog' }, progress(t.done, t.problemCount), h('span', { class: 'mono' }, `${t.done}/${t.problemCount}`)),
          ),
          h(
            'div',
            { class: 'fold-body' },
            h('div', { class: 'fold-desc muted' }, t.desc || ''),
            t.problems.map((p) => probRow({ ...p, status: p.passed ? 'ok' : 'todo', tags: p.tags }, { showContest: false })),
          ),
        ),
      ),
    );
  }

  function render() {
    renderTabs();
    renderBody();
  }
  render();

  return h(
    'div',
    { class: 'stack' },
    sectionHead('题单', '按难度或算法切，全部来自你实际没过的题；洛谷是官方题单的完成进度。'),
    h('div', { class: 'seg-wrap' }, tabs),
    body,
  );
}

/* ------------------------------------------------------------------ 关于 */
export function about() {
  return h(
    'div',
    { class: 'stack narrow' },
    sectionHead('关于这个站', '一个给自己用的算法训练台，顺手做成了能给别人用的样子。'),
    h(
      'section',
      { class: 'card prose' },
      h('h3', {}, '它做什么'),
      h(
        'ul',
        {},
        h('li', {}, '把 Codeforces 与洛谷的账号数据拉到一个页面：rating、比赛、欠账的题。'),
        h('li', {}, '比赛页能看即将开始的场次（带倒计时）、已打过的场次里哪几场「半途而废」，以及每场没做完的题。'),
        h('li', {}, '题单页按难度和算法切分，点任意一题直接跳到可提交的页面。'),
        h('li', {}, '所有数据都是静态 JSON，站点本体可以部署在任何静态托管上。'),
      ),
      h('h3', {}, '这个站怎么认人'),
      h(
        'p',
        {},
        '没有后端，所以不校验密码，也不假装有。顶栏「登录」只是在这台浏览器里记下你要看的账号（CF handle + 可选洛谷 UID），不上传任何东西，可存多个、来回切换。',
      ),
      h(
        'ul',
        {},
        h('li', {}, 'Codeforces：你的浏览器直连官方 API，实时拉取，输入 handle 即可。'),
        h('li', {}, '洛谷：没有开放接口也没有 CORS，只能读构建时写好的快照；站主的数据人人可见，其他人需事先收录进 config.json。'),
        h('li', {}, '退出后回到站主默认数据；换设备要重新记一次。'),
      ),
      h(
        'p',
        {},
        '想试试？ ',
        h('a', { href: '?login=1#/about' }, '打开登录面板'),
        '，或者直接看带 ?cf=xxx&lg=xxx 的分享链接是怎么用的。',
      ),
      h('h3', {}, '数据怎么更新'),
      h(
        'pre',
        { class: 'code' },
        '# 需要 Node 18+\nnpm install\nnpm run fetch   # 抓取 CF + 洛谷，写入 public/data/\nnpm run dev     # 本地预览\nnpm run build   # 产出 dist/',
      ),
      h('p', { class: 'muted' }, '抓取脚本只读公开页面：Codeforces 用官方 API，洛谷读公开个人页与题单。不需要、也不保存任何账号密码。'),
      h('h3', {}, '免责声明'),
      h(
        'p',
        { class: 'muted' },
        '这是一个非官方工具，与 Codeforces、洛谷无关联。数据仅供个人训练参考，请遵守两个平台的使用条款，抓取频率已做了限速与缓存。',
      ),
      h('h3', {}, '下一步'),
      h(
        'ul',
        {},
        h('li', {}, '接入 GitHub Actions：每天定时跑一次 fetch，数据自动更新。'),
        h('li', {}, '加做题记录与错因笔记，形成自己的题解库。'),
        h('li', {}, '多账号已落地（本机）；跨设备同步与队伍模式需要后端。'),
      ),
    ),
  );
}
