/**
 * guest.js — 未登录时看到的东西
 *
 * 原则：没登录就不展示任何人的成绩。页面只解释这个站是干什么的、数据从哪来，
 * 以及一个明确的入口。不在后台悄悄加载数据——访客的浏览器里根本不该出现别人的
 * 提交记录。
 */
import { h } from './ui.js';
import { openLogin } from './login.js';

const PAGE_TITLE = {
  home: '总览',
  contests: '比赛',
  unsolved: '未完成题',
  plan: '做题计划',
  lists: '题单',
};

function loginCta(onChange, text = '登录，看自己的数据') {
  return h('button', { class: 'btn primary', type: 'button', onClick: () => openLogin({ onChange }) }, text);
}

/** 首页：把「这是什么」讲清楚，并且让陌生人 5 秒看到自己的数据 */
export function guestLanding({ onChange, onTry } = {}) {
  const handle = h('input', {
    class: 'input guest-handle',
    type: 'text',
    placeholder: '输入 Codeforces handle',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const go = () => {
    const v = handle.value.trim();
    if (v) onTry?.(v);
  };
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go();
  });

  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'guest-hero' },
      h('div', { class: 'eyebrow' }, 'ALGORITHM DASHBOARD'),
      h('h1', {}, '算法训练台'),
      h(
        'p',
        { class: 'lede' },
        '把 Codeforces 和洛谷的比赛、没做完的题、该补的算法放在一张桌子上。',
      ),
      h(
        'div',
        { class: 'guest-try' },
        handle,
        h('button', { class: 'btn primary', type: 'button', onClick: go }, '立即看我的'),
      ),
      h(
        'p',
        { class: 'guest-note' },
        '不用注册、不用密码——数据是从 Codeforces 公开接口现拉的。想长期用再点「登录」，账号只记在本机。',
      ),
      h('div', { class: 'guest-actions guest-actions-sub' }, loginCta(onChange, '登录 / 添加洛谷')),
    ),

    h(
      'div',
      { class: 'grid-3' },
      featureCard('比赛', '即将开始的场次带倒计时；打完的场次逐题列出过没过，半途而废的直接标出来。'),
      featureCard('欠账的题', '比赛没做完的、练习没过的分开统计，按难度和算法筛，点一行直接进提交页。'),
      featureCard('题单', '按难度分档、按算法分组；洛谷官方题单带完成度，下一步该做哪题也标出来。'),
    ),

    h(
      'section',
      { class: 'card guest-data' },
      h('h2', {}, '数据从哪来'),
      h(
        'ul',
        { class: 'guest-list' },
        h('li', {}, h('b', {}, 'Codeforces'), '：浏览器直连官方公开接口，实时读取。'),
        h('li', {}, h('b', {}, '洛谷'), '：没有开放接口，只能读站点构建时预生成的快照。'),
        h('li', {}, h('b', {}, '账号'), '：只存在本机 localStorage，换设备要重新加一次。'),
      ),
    ),
  );
}

function featureCard(title, desc) {
  return h(
    'div',
    { class: 'card guest-feature' },
    h('h3', {}, title),
    h('p', {}, desc),
  );
}

/** 其余数据页：一句说明 + 登录入口，不伪造任何数字 */
export function guestPrompt(route, { onChange } = {}) {
  const name = PAGE_TITLE[route] || '这一页';
  return h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: 'card guest-lock' },
      h('div', { class: 'guest-lock-mark' }, '◍'),
      h('h2', {}, `「${name}」需要一个账号`),
      h(
        'p',
        { class: 'muted' },
        '这里的每一行都是某个人的真实成绩，所以不登录就不展示。填一个 Codeforces handle 就能看自己的。',
      ),
      h('div', { class: 'guest-actions' }, loginCta(onChange)),
      h('p', { class: 'guest-note' }, '想先了解这个站？去「关于」页。'),
    ),
  );
}
