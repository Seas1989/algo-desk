/**
 * accounts.js — 本地多账号
 *
 * 这个站没有后端（GitHub Pages 上只有静态文件），所以「登录」不做密码校验，
 * 也不假装有：一个账号就是「一个 CF handle + 一个洛谷 UID」，存在本机浏览器里，
 * 用来决定拉谁的数据。换台电脑就得重新加一次，这是静态站的诚实边界。
 *
 * 存储结构：
 *   algodesk.accounts.v2 = { list: [{ id, cf, luogu, label, addedAt }], activeId }
 */

const KEY = 'algodesk.accounts.v2';

const CF_RE = /^[A-Za-z0-9_.-]{3,24}$/;
const UID_RE = /^\d{1,9}$/;

export function normalizeCf(handle) {
  const v = String(handle || '').trim();
  if (!v) return { ok: false, error: '填一个 Codeforces handle' };
  if (!CF_RE.test(v)) return { ok: false, error: 'handle 只能有字母、数字、下划线、点、连字符，长度 3–24' };
  return { ok: true, value: v };
}

export function normalizeLuogu(uid) {
  const raw = String(uid || '').trim();
  if (!raw) return { ok: true, value: '' }; // 洛谷可选

  // 允许直接粘个人主页链接：luogu.com.cn/user/<uid>
  const fromUrl = /luogu\.com(?:\.cn)?\/user\/(\d{1,9})/i.exec(raw);
  const v = fromUrl ? fromUrl[1] : raw;

  if (!UID_RE.test(v)) {
    return { ok: false, error: '洛谷 UID 是个人主页地址里 /user/ 后面那串数字' };
  }
  return { ok: true, value: v };
}

const idOf = (cf, luogu) => `${cf}|${luogu || ''}`;

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const list = Array.isArray(raw.list) ? raw.list.filter((a) => a && a.cf) : [];
    const activeId = list.some((a) => a.id === raw.activeId) ? raw.activeId : null;
    return { list, activeId };
  } catch {
    return { list: [], activeId: null };
  }
}

function write(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 隐私模式：本次会话内仍然可用，只是关掉页面就没了 */
  }
}

export function listAccounts() {
  return read().list;
}

export function activeAccount() {
  const { list, activeId } = read();
  return list.find((a) => a.id === activeId) || null;
}

export function hasAccounts() {
  return read().list.length > 0;
}

/** 加一个账号；已存在就复用（不重复加） */
export function addAccount({ cf, luogu = '', label = '' }) {
  const c = normalizeCf(cf);
  if (!c.ok) throw new Error(c.error);
  const u = normalizeLuogu(luogu);
  if (!u.ok) throw new Error(u.error);

  const state = read();
  const id = idOf(c.value, u.value);
  let acc = state.list.find((a) => a.id === id);
  if (!acc) {
    acc = {
      id,
      cf: c.value,
      luogu: u.value,
      label: String(label || '').slice(0, 30),
      addedAt: Date.now(),
    };
    state.list.unshift(acc);
  }
  state.activeId = id;
  write(state);
  return acc;
}

export function removeAccount(id) {
  const state = read();
  state.list = state.list.filter((a) => a.id !== id);
  if (state.activeId === id) state.activeId = state.list[0]?.id || null;
  write(state);
}

export function activate(id) {
  const state = read();
  if (!state.list.some((a) => a.id === id)) return null;
  state.activeId = id;
  write(state);
  return state.list.find((a) => a.id === id);
}

/** 退出账号：回到「站主快照」的访客视图 */
export function signOut() {
  const state = read();
  state.activeId = null;
  write(state);
}

export const accountName = (a) => (a ? a.label || a.cf : '访客');
