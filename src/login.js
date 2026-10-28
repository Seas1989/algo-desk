/**
 * login.js — 账号面板（本地多账号，无后端）
 *
 * 不校验密码是刻意的：这里没有服务器能验证任何东西，做个假登录框只会骗人。
 * 面板里把「数据从哪来、什么能查、什么查不到」写清楚，比一个假的密码框有用。
 */
import { h } from './ui.js';
import { listAccounts, activeAccount, addAccount, removeAccount, activate, signOut, accountName } from './accounts.js';

let maskEl = null;

function close() {
  if (maskEl) {
    maskEl.remove();
    maskEl = null;
    document.body.classList.remove('acct-open');
  }
}

/**
 * @param {{ onChange: () => void }} opts 切换账号后让主程序重新拉数据
 */
export function openLogin({ onChange } = {}) {
  close();

  const current = activeAccount();
  const formError = h('p', { class: 'acct-error' });

  const cfInput = h('input', {
    class: 'input',
    type: 'text',
    placeholder: '你的 Codeforces handle',
    autocomplete: 'off',
    spellcheck: 'false',
    value: current?.cf || '',
  });
  const lgInput = h('input', {
    class: 'input',
    type: 'text',
    placeholder: '可选',
    autocomplete: 'off',
    spellcheck: 'false',
    value: current?.luogu || '',
  });

  const submit = h('button', { class: 'btn primary', type: 'submit' }, '保存并查看');

  const form = h(
    'form',
    { class: 'acct-form' },
    h('label', { class: 'acct-label' }, 'Codeforces handle'),
    cfInput,
    h('label', { class: 'acct-label' }, '洛谷 UID'),
    lgInput,
    h(
      'p',
      { class: 'acct-hint' },
      'UID 是洛谷个人主页地址里 /user/ 后面那串数字（',
      h('span', { class: 'mono' }, 'luogu.com.cn/user/<UID>'),
      '）；直接把整条主页链接粘进来也可以。',
    ),
    h('p', { class: 'acct-hint' }, 'CF 数据是实时拉的；洛谷没有开放接口，只有站点构建时收录过的 UID 才有数据。'),
    formError,
    submit,
  );

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    formError.textContent = '';
    try {
      addAccount({ cf: cfInput.value, luogu: lgInput.value });
      close();
      onChange?.();
    } catch (err) {
      formError.textContent = err.message || '保存失败';
    }
  });

  function accountRow(a) {
    const isOn = a.id === current?.id;
    const switchBtn = h(
      'button',
      {
        class: `btn ghost small${isOn ? ' on' : ''}`,
        type: 'button',
        onClick: () => {
          activate(a.id);
          close();
          onChange?.();
        },
      },
      isOn ? '当前' : '切换',
    );
    const delBtn = h(
      'button',
      {
        class: 'btn ghost small danger',
        type: 'button',
        title: '从这台设备上移除',
        onClick: () => {
          removeAccount(a.id);
          close();
          onChange?.();
        },
      },
      '移除',
    );
    return h(
      'div',
      { class: 'acct-row' },
      h(
        'div',
        { class: 'acct-row-main' },
        h('div', { class: 'acct-row-name' }, accountName(a)),
        h(
          'div',
          { class: 'acct-row-meta mono' },
          `CF ${a.cf}`,
          a.luogu ? ` · 洛谷 ${a.luogu}` : ' · 未绑洛谷',
        ),
      ),
      switchBtn,
      delBtn,
    );
  }

  const list = listAccounts();

  const body = h(
    'div',
    { class: 'acct-body' },
    h('p', { class: 'acct-lede' }, '这个站没有服务器，所以「登录」只是把你要看的账号记在这台浏览器里，不会上传任何东西。'),
    form,
    list.length
      ? h(
          'div',
          { class: 'acct-list' },
          h('div', { class: 'acct-list-title' }, `这台设备上的账号（${list.length}）`),
          list.map(accountRow),
        )
      : null,
    h(
      'div',
      { class: 'acct-foot' },
      h('span', { class: 'muted' }, '不登录只能看「关于」页。'),
      current
        ? h(
            'button',
            {
              class: 'btn ghost small',
              type: 'button',
              onClick: () => {
                signOut();
                close();
                onChange?.();
              },
            },
            '退出，回到访客视图',
          )
        : null,
    ),
  );

  maskEl = h(
    'div',
    {
      class: 'acct-mask',
      onClick: (e) => {
        if (e.target === maskEl) close();
      },
    },
    h(
      'div',
      { class: 'acct-modal card', role: 'dialog', 'aria-modal': 'true', 'aria-label': '账号' },
      h(
        'div',
        { class: 'acct-head' },
        h('h2', {}, current ? '账号' : '登录'),
        h('button', { class: 'acct-close', type: 'button', title: '关闭', onClick: close }, '×'),
      ),
      body,
    ),
  );

  document.body.append(maskEl);
  document.body.classList.add('acct-open');
  setTimeout(() => cfInput.focus(), 30);

  const onKey = (e) => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}

/** 顶栏那个按钮 */
export function accountButton({ onChange } = {}) {
  const a = activeAccount();
  const label = a ? accountName(a) : '登录';
  const btn = h(
    'button',
    { class: `btn ghost acct-btn${a ? ' on' : ''}`, type: 'button', title: a ? `当前账号：${a.cf}` : '输入你的 CF handle' },
    h('span', { class: 'acct-dot' }),
    label,
  );
  btn.addEventListener('click', () => openLogin({ onChange }));
  return btn;
}
