/**
 * ai.js — BYOK AI 教练：自带 API Key，浏览器直连 OpenAI 兼容接口。
 * Key 只存本机 localStorage["algodesk.ai"]；请求体只含公开统计数据。
 */
import { h } from './ui.js';
import { buildContext } from './ai-context.js';

const KEY = 'algodesk.ai';
const PRESETS = {
  DeepSeek: { baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  硅基流动: { baseURL: 'https://api.siliconflow.cn/v1', model: 'Pro/deepseek-ai/DeepSeek-V3' },
  通义: { baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  智谱: { baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  OpenRouter: { baseURL: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat-v3-0324:free' },
  自定义: { baseURL: '', model: '' },
};
const SYSTEM =
  '你是算法竞赛教练。只依据下面给出的数据回答，数据里没有的题目不要编造。给建议要具体到题号和做法方向，不要泛泛而谈。不确定就直说信息不足。中文回答，控制在 200 字以内。';
const QUICK = ['解释这道题', '给我今天的计划', '我卡在哪', '推荐 3 道同类型'];

/**
 * 把接口的错误说人话。只回一句「HTTP 400」等于没说：
 * 400 大多数时候是模型名写错（比如 deepseek 而不是 deepseek-chat），
 * 服务商返回的 error.message 里其实写得很清楚。
 */
async function apiError(res, cfg) {
  let detail = '';
  try {
    const t = await res.text();
    try {
      const j = JSON.parse(t);
      detail = j?.error?.message || j?.message || j?.error || '';
    } catch {
      detail = t.slice(0, 160);
    }
  } catch {
    /* 读不出响应体就算了 */
  }
  const head = `请求失败（HTTP ${res.status}${cfg?.model ? `，模型 ${cfg.model}` : ''}）`;
  const hint =
    res.status === 400
      ? '常见原因：模型名不对（DeepSeek 用 deepseek-chat）、API 地址多了 /chat/completions。'
      : res.status === 404
        ? '地址可能不对：填到域名或 /v1 为止，不要带 /chat/completions。'
        : '';
  return [head, detail, hint].filter(Boolean).join('\n');
}

const loadCfg = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
};
const saveCfg = (c) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* 隐私模式：配置不落盘 */
  }
};

let drawer = null;
let history = [];

export function toggle() {
  if (drawer) drawer.classList.toggle('open');
}

export function openAI(getData) {
  if (drawer) {
    toggle();
    return;
  }
  const cfg = loadCfg();

  /* 设置面板 */
  const baseIn = h('input', { class: 'input', type: 'text', placeholder: 'https://…/v1', value: cfg.baseURL || '' });
  const keyIn = h('input', { class: 'input', type: 'password', placeholder: 'sk-…', value: cfg.apiKey || '' });
  const modelIn = h('input', { class: 'input', type: 'text', placeholder: '模型名', value: cfg.model || '' });
  // 地址带不带结尾斜杠、带不带 /v1 都应该认出是哪家，否则下拉会退化成「自定义」
  const normUrl = (u) => String(u || '').trim().replace(/\/+$/, '').replace(/\/v1$/i, '').toLowerCase();
  const curName = cfg.baseURL
    ? Object.keys(PRESETS).find((k) => normUrl(PRESETS[k].baseURL) === normUrl(cfg.baseURL)) || '自定义'
    : 'DeepSeek';
  const presetSel = h(
    'select',
    { class: 'input' },
    ...Object.keys(PRESETS).map((k) => h('option', { value: k, selected: k === curName || null }, k)),
  );
  presetSel.addEventListener('change', () => {
    const p = PRESETS[presetSel.value];
    if (p.baseURL) baseIn.value = p.baseURL;
    if (p.model) modelIn.value = p.model;
  });
  const settings = h(
    'div',
    { class: 'ai-settings' },
    h('label', {}, '服务商'),
    presetSel,
    h('label', {}, 'API 地址'),
    baseIn,
    h('label', {}, 'API Key'),
    keyIn,
    h('label', {}, '模型'),
    modelIn,
    h(
      'div',
      { class: 'ai-set-row' },
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onClick: () => {
            saveCfg({ baseURL: baseIn.value.trim(), apiKey: keyIn.value.trim(), model: modelIn.value.trim() });
            settings.classList.remove('open');
            pushMsg('assistant', '已保存。Key 只存在这台浏览器的 localStorage 里，不会上传到别处。');
          },
        },
        '保存',
      ),
      h('span', { class: 'ai-note' }, 'Key 只保存在本机浏览器，不上传。'),
    ),
  );
  if (!cfg.apiKey) settings.classList.add('open');

  /* 消息流 */
  const msgs = h('div', { class: 'ai-msgs' });
  const pushMsg = (role, text) => {
    msgs.append(h('div', { class: `ai-msg ${role}` }, text));
    msgs.scrollTop = msgs.scrollHeight;
  };
  pushMsg('assistant', '我可以基于你本地的 CF / 洛谷数据做分析。选个快捷指令，或直接输入问题。');

  const input = h('input', { class: 'input ai-input', type: 'text', placeholder: '问我任何关于你刷题的问题' });
  const sendBtn = h('button', { class: 'btn', type: 'button' }, '发送');

  async function ask(text) {
    text = (text || '').trim();
    if (!text) return;
    const c = loadCfg();
    if (!c.apiKey || !c.baseURL) {
      settings.classList.add('open');
      pushMsg('assistant', '还没有配置 API Key：填好 API 地址、Key 和模型后保存即可，Key 只存在本机。');
      return;
    }
    pushMsg('user', text);
    input.value = '';
    sendBtn.disabled = true;
    sendBtn.textContent = '思考中…';
    const msgsOut = [
      { role: 'system', content: `${SYSTEM}\n【账号数据】\n${buildContext(getData())}` },
      ...history.slice(-12),
      { role: 'user', content: text },
    ];
    history.push({ role: 'user', content: text });
    try {
      const res = await fetch(`${c.baseURL.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}` },
        body: JSON.stringify({ model: c.model, messages: msgsOut, temperature: 0.3, max_tokens: 800 }),
      });
      if (res.status === 401 || res.status === 403) throw new Error('Key 无效，检查 API Key 是否正确。');
      if (res.status === 429) throw new Error('触发限流，稍等一会儿再试。');
      if (!res.ok) throw new Error(await apiError(res, c));
      const j = await res.json();
      const txt = j.choices?.[0]?.message?.content || '没有返回内容。';
      history.push({ role: 'assistant', content: txt });
      pushMsg('assistant', txt);
    } catch (e) {
      pushMsg('assistant', e instanceof TypeError ? '连不上，检查 API 地址是否填对（例如 https://api.deepseek.com/v1）。' : e.message || '请求失败，稍后重试。');
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = '发送';
    }
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ask(input.value);
  });
  sendBtn.addEventListener('click', () => ask(input.value));

  drawer = h(
    'aside',
    { class: 'ai-drawer', 'aria-label': 'AI 教练' },
    h(
      'div',
      { class: 'ai-head' },
      h('b', {}, 'AI 教练'),
      h(
        'div',
        { class: 'ai-head-btns' },
        h(
          'button',
          { class: 'mini-btn', type: 'button', onClick: () => settings.classList.toggle('open') },
          '设置',
        ),
        h(
          'button',
          { class: 'mini-btn', type: 'button', onClick: () => drawer.classList.remove('open') },
          '收起',
        ),
      ),
    ),
    settings,
    msgs,
    h('div', { class: 'ai-quick' }, ...QUICK.map((q) => h('button', { class: 'chip ghost ai-quick-btn', type: 'button', onClick: () => ask(q) }, q))),
    h('div', { class: 'ai-inputrow' }, input, sendBtn),
    h('p', { class: 'ai-foot' }, '仅支持 Codeforces / 本工具的离线数据提问；请求直接发往你填写的 API 地址。'),
  );
  document.body.append(drawer);
  drawer.classList.add('open');
}
