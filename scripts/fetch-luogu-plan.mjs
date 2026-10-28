#!/usr/bin/env node
/**
 * fetch-luogu-plan.mjs — 登录后抓取你的洛谷「做题计划」
 *
 *   node scripts/fetch-luogu-plan.mjs                 # 读 luogu-cred.json
 *   node scripts/fetch-luogu-plan.mjs --probe         # 同时把原始 JSON 存 .cache/ 便于排查
 *   node scripts/fetch-luogu-plan.mjs --cookie=lt=xxx # 跳过密码，用浏览器里现成的登录态
 *
 * 凭据只从本地 luogu-cred.json（已 gitignore）或命令行读取，只发送给
 * luogu.com.cn 官方域名，不写进任何产出文件。洛谷没有开放 API，这一步只能
 * 在你自己的机器上跑（浏览器里做不了：没有 CORS，密码也不该进静态站）。
 *
 * 产出：public/data/luogu-plan.json —— 做题计划页会据此提供「一键排进计划」。
 * 注意：这个文件会随仓库部署变成公开页面，只包含题号题名和你排的日期。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(ROOT, 'public', 'data');
const CRED = path.join(ROOT, 'luogu-cred.json');

const args = process.argv.slice(2);
const PROBE = args.includes('--probe');
const argOf = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const BASE = 'https://www.luogu.com.cn';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

/* ---------------------------------------------------------------- 凭据 */
function readCred() {
  let cred = {};
  if (fs.existsSync(CRED)) {
    try {
      cred = JSON.parse(fs.readFileSync(CRED, 'utf8'));
    } catch {
      throw new Error('luogu-cred.json 不是合法 JSON，检查引号和逗号。');
    }
  }
  const username = argOf('user', cred.username || cred.uid || '');
  const password = argOf('pass', cred.password || '');
  return { username: String(username || ''), password: String(password || ''), uid: String(cred.luoguUid || '') };
}

/* ---------------------------------------------------------------- cookie 罐 */
const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
function absorb(res) {
  const raw = res.headers.get('set-cookie') || '';
  for (const part of raw.split(/,(?=[^;]+=[^;,]+)/)) {
    const m = /^([^=]+)=([^;]*)/.exec(part.trim());
    if (m) jar.set(m[1], m[2]);
  }
}

async function req(route, init = {}) {
  const res = await fetch(BASE + route, {
    redirect: 'manual',
    ...init,
    headers: { 'user-agent': UA, cookie: cookieHeader(), ...(init.headers || {}) },
  });
  absorb(res);
  return res;
}

/** 页面里嵌的 lentille-context JSON；拿不到就试整体 JSON（/_lfe/*） */
function parseBody(txt) {
  const m = /<script id="lentille-context" type="application\/json">([\s\S]*?)<\/script>/.exec(txt);
  if (m) return JSON.parse(m[1]);
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- 登录 */
async function login({ username, password }) {
  if (!username || !password) {
    throw new Error(
      '缺少账号或密码：在仓库根目录建 luogu-cred.json，内容 {"username":"你的账号或UID","password":"你的密码"}（该文件已被 gitignore，不会提交）。也可以改用 --cookie=lt=... 复用浏览器登录态。',
    );
  }
  await req('/'); // 先拿 C3VK 等基础 Cookie
  const res = await req('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password, remember: true }),
  });
  const txt = await res.text();
  let j = null;
  try {
    j = JSON.parse(txt);
  } catch {
    /* 非 JSON：可能是风控页 */
  }
  if (!jar.has('lt')) {
    const why = j?.error || j?.message || txt.slice(0, 120);
    throw new Error(
      `登录失败：${why}\n` +
        '如果提示验证码/设备保护，改为在浏览器登录洛谷后按 F12 → Application → Cookies 复制 lt 的值，跑：node scripts/fetch-luogu-plan.mjs --cookie=' +
        'lt=<你的lt值>',
    );
  }
  log('  ✔ 登录成功（lt cookie 已拿到，只存在本进程内存里）');
}

/* ---------------------------------------------------------------- 提取题目 */
const isPid = (v) => typeof v === 'string' && /^P\d{1,7}$/i.test(v);
const DATE_RE = /\d{4}-\d{2}-\d{2}/;

/** 递归收集一切带 pid 的对象：题号、题名（若同层有）、计划日期（若是 2026-10-30 这种串） */
function collectPlan(node, out, depth = 0) {
  if (depth > 12 || node == null) return;
  if (Array.isArray(node)) {
    for (const v of node) collectPlan(v, out, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;
  if (isPid(node.pid ?? node.problemId ?? node.code)) {
    const raw = String(node.pid ?? node.problemId ?? node.code).toUpperCase();
    const pid = raw.startsWith('P') ? raw : 'P' + raw;
    const dateStr = Object.values(node).find(
      (v) => typeof v === 'string' && DATE_RE.test(v.slice(0, 10)),
    );
    const found = out.get(pid) || { pid };
    const name = node.name ?? node.title ?? node.problemName;
    if (typeof name === 'string' && name && !found.name) found.name = name;
    if (dateStr && !found.planDate) found.planDate = dateStr.slice(0, 10);
    out.set(pid, found);
  }
  for (const v of Object.values(node)) collectPlan(v, out, depth + 1);
}

/* ---------------------------------------------------------------- 主流程 */
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const cred = readCred();
const cookieArg = argOf('cookie', '');

log('▶ 洛谷做题计划');
if (cookieArg) {
  for (const part of cookieArg.split(/;\s*/)) {
    const [k, ...v] = part.split('=');
    if (k) jar.set(k, v.join('='));
  }
  if (!jar.has('lt')) jar.set('lt', cookieArg); // 允许只粘 lt 的值
  log('  使用提供的 cookie，跳过密码登录');
} else {
  await login(cred);
}

// 确认登录态，顺便拿自己的 UID
let uid = cred.uid;
{
  const me = parseBody(await (await req('/_lfe/runtime')).text()) || {};
  const u = me?.data?.user || me?.user;
  if (u?.uid) uid = uid || String(u.uid);
  if (!jar.has('lt') || u?.user === null) log('  ⚠ 可能未登录：拿到的是游客视角，私有计划会是空');
}

// 候选位置逐个试：登录态个人主页（计划卡片内嵌其中）为主，其余兜底
const routes = [`/user/${uid || ''}`, '/usercenter', '/_lfe/usercenter/plan', '/problem/plan'].filter(
  (r) => r !== '/user/',
);
const planMap = new Map();
const raws = {};
for (const route of routes) {
  await sleep(600);
  let body;
  try {
    const res = await req(route);
    if (!res.ok && res.status >= 400) {
      log(`  · ${route} → HTTP ${res.status}，跳过`);
      continue;
    }
    body = parseBody(await res.text());
  } catch (e) {
    log(`  · ${route} 失败：${e.message}`);
    continue;
  }
  if (!body) continue;
  raws[route.replace(/[^\w]/g, '_')] = body;
  const before = planMap.size;
  collectPlan(body, planMap);
  log(`  · ${route}：新收获 ${planMap.size - before} 题（累计 ${planMap.size}）`);
}

if (!planMap.size) {
  if (PROBE) fs.writeFileSync(path.join(CACHE, 'luogu-plan-raw.json'), JSON.stringify(raws, null, 1));
  throw new Error(
    '没能在返回的页面里认做题计划的题。' +
      (PROBE ? '原始 JSON 已存 .cache/luogu-plan-raw.json，把其中的键结构发给开发者补识别规则。' : '加 --probe 重跑，把 .cache/luogu-plan-raw.json 里的结构发给开发者。') +
      '\n也可以先手动应急：在洛谷计划页 Ctrl+S 存网页或逐题抄给「做题计划」页的导入框。',
  );
}

// 题名补齐：优先本仓库已抓好的 luogu.json（官方题单里有 pid→name 字典）
const nameByPid = new Map();
try {
  const lg = JSON.parse(fs.readFileSync(path.join(OUT, 'luogu.json'), 'utf8'));
  for (const t of lg.trainings || []) for (const p of t.problems || []) if (p?.pid) nameByPid.set(p.pid, p.name);
} catch {
  /* 没有就缺省 */
}

const problems = [...planMap.values()]
  .sort((a, b) => (a.planDate || '9999').localeCompare(b.planDate || '9999') || a.pid.localeCompare(b.pid))
  .map((p) => ({
    pid: p.pid,
    name: p.name || nameByPid.get(p.pid) || p.pid,
    url: `https://www.luogu.com.cn/problem/${p.pid}`,
    ...(p.planDate ? { planDate: p.planDate } : {}),
  }));

const out = { fetchedAt: new Date().toISOString(), uid: uid || null, count: problems.length, problems };
fs.writeFileSync(path.join(OUT, 'luogu-plan.json'), JSON.stringify(out, null, 1));
log(`✔ public/data/luogu-plan.json —— ${problems.length} 题${out.problems[0]?.planDate ? '（含计划日期）' : ''}`);
log('  打开站点「做题计划」页，点「按洛谷计划排进来」即可。');
if (PROBE) fs.writeFileSync(path.join(CACHE, 'luogu-plan-raw.json'), JSON.stringify(raws, null, 1));
