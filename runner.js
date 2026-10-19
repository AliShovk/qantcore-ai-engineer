/*! Qantcore AI Engineer — первоисточник: https://qantcore.space/ai-engineer/
 *  (c) 2026 Qantcore. Если этот файл открыт на другом домене — перед вами копия.
 *  Оригинал, история и лицензия: см. ссылку выше. */
// Живой запуск агента из браузера. Чистый модуль: DOM нет, fetch инжектится.
// Порт runtime/main.py (build_agent/ask) и runtime/llm.py — поведение совпадает,
// кроме сериализации tool_calls в запросах OpenAI (см. toOpenAI ниже).
import { KINDS } from './boards.js?v=4';

const BROWSER_UNSUPPORTED = new Set(['gemini', 'yandexgpt', 'gigachat']);
const OPENAI_BASES = {
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

const lines = (v) => String(v || '').split('\n').map((x) => x.trim()).filter(Boolean);
const contains = (hay, needles) => { const low = String(hay).toLowerCase(); return needles.some((n) => low.includes(n.toLowerCase())); };
const variantName = (kind, id) => KINDS[kind]?.variants.find((x) => x.id === id)?.name || id;
const sanitize = (name) => String(name || 'call_api').replace(/[^a-zA-Z0-9_]/g, '_');

function allParts(state) {
  const out = [];
  for (const b of Object.values(state.boards || {})) out.push(...(b.parts || []));
  return out;
}
const findPart = (parts, kind, variant) => parts.find((p) => p.kind === kind && (variant === undefined || p.variant === variant));

function baseUrl(variant, values) {
  if (variant === 'ollama') return (values.baseUrl || 'http://localhost:11434').replace(/\/+$/, '') + '/v1';
  if (variant === 'openai') return (values.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  return OPENAI_BASES[variant] || null;
}

export function prepare(state) {
  const parts = allParts(state);
  const llm = findPart(parts, 'llm');
  if (!llm) return { ok: false, reason: 'На плате ядра нет детали LLM', tools: [], unavailable: [] };
  const name = variantName('llm', llm.variant);
  if (BROWSER_UNSUPPORTED.has(llm.variant))
    return { ok: false, unsupported: true, reason: `${name} пока не вызывается из браузера — запустите .zip или выберите OpenAI-совместимого провайдера (OpenRouter, Polza.ai)`, fixUid: llm.uid, tools: [], unavailable: [] };
  const v = llm.values || {};
  if (llm.variant !== 'ollama' && !String(v.apiKey || '').trim())
    return { ok: false, reason: `Нужен API-ключ для ${name}`, fixUid: llm.uid, tools: [], unavailable: [] };

  const prompt = findPart(parts, 'prompt', 'system');
  const system = prompt ? ((prompt.values.role || '') + '\n' + (prompt.values.rules || '')).trim() : '';
  const pp = findPart(parts, 'params', 'sampling');
  const params = {
    temperature: parseFloat(pp?.values?.temperature ?? 0.3),
    maxTokens: parseInt(pp?.values?.maxTokens ?? 4096, 10) || 4096,
  };
  const planner = findPart(parts, 'planner');
  const maxSteps = Math.min(parseInt(planner?.values?.maxSteps || 8, 10) || 8, 25);
  const buffer = findPart(parts, 'buffer');
  const histSize = parseInt(buffer?.values?.size || 20, 10) || 20;
  const guard = findPart(parts, 'guardrails');
  const deny = lines(guard?.values?.deny);
  const appr = findPart(parts, 'approval');
  const actions = lines(appr?.values?.actions);

  const tools = [], unavailable = [];
  const search = findPart(parts, 'search');
  if (search) {
    if (search.variant === 'tavily' && String(search.values?.apiKey || '').trim()) {
      const key = search.values.apiKey;
      tools.push({
        name: 'web_search', description: 'Поиск в интернете. Возвращает заголовки, ссылки и сниппеты.',
        parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        board: 'tools', uid: search.uid,
        async run(a, fetch) {
          const r = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: a.query || '', max_results: 5 }) });
          if (!r.ok) throw new Error(`Tavily: HTTP ${r.status}`);
          const d = await r.json();
          return JSON.stringify((d.results || []).map((x) => ({ title: x.title || '', url: x.url || '', snippet: x.content || '' })));
        },
      });
    } else unavailable.push(`${variantName('search', search.variant)} (поиск)`);
  }
  const http = findPart(parts, 'http', 'rest');
  if (http && String(http.values?.url || '').trim()) {
    const cfg = http.values;
    const base = cfg.url.replace(/\/+$/, ''), auth = String(cfg.authHeader || '').trim(), key = cfg.apiKey || '';
    tools.push({
      name: sanitize(cfg.name), description: `Вызов внешнего API ${base}. Возвращает тело ответа.`,
      parameters: { type: 'object', properties: { path: { type: 'string' }, method: { type: 'string' }, body: { type: 'object' } }, required: ['path'] },
      board: 'tools', uid: http.uid,
      async run(a, fetch) {
        const method = String(a.method || cfg.method || 'GET').toUpperCase();
        const url = /^https?:\/\//i.test(a.path || '') ? a.path : base + '/' + String(a.path || '').replace(/^\/+/, '');
        const headers = {};
        if (auth) {
          const i = auth.indexOf(':');
          headers[i >= 0 ? auth.slice(0, i).trim() : auth] = (i >= 0 ? auth.slice(i + 1).trim() + ' ' + key : key).trim();
        }
        const r = await fetch(url, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(a.body ?? null) });
        return (await r.text()).slice(0, 8000);
      },
    });
  }
  if (findPart(parts, 'browser')) unavailable.push('Браузер (fetch_url)');
  const kb = findPart(parts, 'kb');
  if (kb && kb.variant === 'files') unavailable.push('База знаний (файлы)');

  return {
    ok: true,
    llm: { variant: llm.variant, model: v.model || '', key: v.apiKey || '', baseUrl: llm.variant === 'anthropic' ? null : baseUrl(llm.variant, v), uid: llm.uid },
    system, params, maxSteps, histSize, deny, actions, tools, unavailable,
  };
}

// ---------- LLM adapters (порт llm.py) ----------

// Внутренние tool_calls {id,name,args} → формат OpenAI при отправке.
// NB: Python-рантайм шлёт внутренний формат как есть — здесь сериализуем правильно.
function toOpenAI(messages) {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.tool_calls)
      return { role: 'assistant', content: m.content ?? null, tool_calls: m.tool_calls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) } })) };
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, name: m.name, content: m.content };
    return { role: m.role, content: m.content ?? null };
  });
}
const openAITools = (tools) => tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.parameters || { type: 'object', properties: {} } } }));
function parseOpenAI(d) {
  const msg = d.choices?.[0]?.message || {};
  const calls = (msg.tool_calls || []).map((tc, i) => {
    let args = {};
    try { args = JSON.parse(tc.function?.arguments || '{}'); } catch (e) { /* не-JSON */ }
    return { id: tc.id || 'call_' + i, name: tc.function?.name || '', args };
  });
  const u = d.usage;
  return { content: msg.content ?? null, tool_calls: calls, usage: u ? { in: u.prompt_tokens ?? null, out: u.completion_tokens ?? null } : null };
}
async function chatOpenAI(fetch, cfg, messages, tools, params) {
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.key) headers['Authorization'] = `Bearer ${cfg.key}`;
  const body = { model: cfg.model, messages: toOpenAI(messages), temperature: params.temperature ?? 0.3, max_tokens: params.maxTokens ?? 4096 };
  if (tools.length) body.tools = openAITools(tools);
  const r = await fetch(cfg.baseUrl + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) throw httpErr(r.status, await r.text());
  return parseOpenAI(await r.json());
}

function toAnthropicMessages(messages) {
  const system = [], out = [];
  for (const m of messages) {
    if (m.role === 'system') { system.push(m.content || ''); continue; }
    if (m.role === 'assistant' && m.tool_calls) {
      const blocks = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.tool_calls) blocks.push({ type: 'tool_use', id: tc.id || '', name: tc.name || '', input: tc.args || {} });
      out.push({ role: 'assistant', content: blocks });
    } else if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.tool_call_id || '', content: m.content || '' };
      const last = out[out.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content)) last.content.push(block);
      else out.push({ role: 'user', content: [block] });
    } else {
      const last = out[out.length - 1];
      if (last && last.role === m.role && typeof last.content === 'string') last.content += '\n' + (m.content || '');
      else out.push({ role: m.role, content: m.content || '' });
    }
  }
  return { system: system.join('\n'), messages: out };
}
const anthropicTools = (tools) => tools.map((t) => ({ name: t.name, description: t.description || '', input_schema: t.parameters || { type: 'object', properties: {} } }));
function parseAnthropic(d) {
  const content = [], calls = [];
  for (const b of d.content || []) {
    if (b.type === 'text') content.push(b.text || '');
    else if (b.type === 'tool_use') calls.push({ id: b.id || '', name: b.name || '', args: b.input || {} });
  }
  const u = d.usage;
  return { content: content.join('\n') || null, tool_calls: calls, usage: u ? { in: u.input_tokens ?? null, out: u.output_tokens ?? null } : null };
}
async function chatAnthropic(fetch, cfg, messages, tools, params) {
  const { system, messages: conv } = toAnthropicMessages(messages);
  const body = { model: cfg.model, messages: conv, max_tokens: params.maxTokens ?? 4096 };
  if (system) body.system = system;
  if (params.temperature != null) body.temperature = params.temperature;
  if (tools.length) body.tools = anthropicTools(tools);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw httpErr(r.status, await r.text());
  return parseAnthropic(await r.json());
}

const httpErr = (status, body) => Object.assign(new Error(`HTTP ${status}`), { status, body: String(body || '').slice(0, 300) });

async function chat(fetch, cfg, messages, tools, params) {
  if (cfg.variant === 'anthropic') return chatAnthropic(fetch, cfg, messages, tools, params);
  return chatOpenAI(fetch, cfg, messages, tools, params);
}

// ---------- один ход диалога (порт main.py ask) ----------

export async function runTurn(cfg, hist, message, { fetch, onEvent, approve, now = () => performance.now() }) {
  const ev = onEvent || (() => {});
  const t0 = now();
  ev({ type: 'start', board: 'channels' });
  const totals = { in: 0, out: 0, ms: 0 };
  const finish = (reply) => {
    hist.push({ role: 'assistant', content: reply });
    hist.splice(0, Math.max(0, hist.length - cfg.histSize * 2));
    totals.ms = Math.round(now() - t0);
    ev({ type: 'final', board: 'channels', reply, totals });
    return reply;
  };

  const blocked = cfg.deny.length && contains(message, cfg.deny);
  ev({ type: 'guard', board: 'control', blocked });
  if (blocked) return finish('Запрос заблокирован политикой');

  hist.push({ role: 'user', content: message });
  const msgs = (cfg.system ? [{ role: 'system', content: cfg.system }] : []).concat(hist);
  const byName = Object.fromEntries(cfg.tools.map((t) => [t.name, t]));

  const errMsg = (e) => {
    if (e && e.status != null) return `LLM: ${e.status} ${e.body || ''}`.trim();
    let m = `LLM: сеть/CORS: ${e?.message || e}`;
    if (cfg.llm?.variant === 'ollama') m += ' — Ollama: запустите её с OLLAMA_ORIGINS=https://qantcore.space';
    return m;
  };

  let reply = '';
  for (let step = 1; step <= cfg.maxSteps; step++) {
    ev({ type: 'llm_start', board: 'core', step });
    const s0 = now();
    let r;
    try {
      r = await chat(fetch, cfg.llm, msgs, cfg.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })), cfg.params);
    } catch (e) {
      const message2 = errMsg(e);
      ev({ type: 'error', board: 'core', step, ms: Math.round(now() - s0), message: message2 });
      throw new Error(message2);
    }
    const ms = Math.round(now() - s0);
    if (r.usage) { totals.in += r.usage.in || 0; totals.out += r.usage.out || 0; }
    ev({ type: 'llm_end', board: 'core', step, ms, usage: r.usage, toolCalls: r.tool_calls.length });
    if (!r.tool_calls.length) { reply = r.content || ''; return finish(reply); }
    msgs.push({ role: 'assistant', content: r.content, tool_calls: r.tool_calls });
    for (const tc of r.tool_calls) {
      ev({ type: 'tool_start', board: 'tools', name: tc.name, args: tc.args });
      const ts = now();
      let result, blockedBy;
      const argsJson = JSON.stringify(tc.args || {});
      if (cfg.actions.length && (contains(tc.name, cfg.actions) || contains(argsJson, cfg.actions))) {
        const ok = approve ? await approve({ name: tc.name, args: tc.args }) : false;
        if (!ok) { result = 'Отклонено человеком'; blockedBy = 'approval'; }
      }
      if (result === undefined && cfg.deny.length && contains(argsJson, cfg.deny)) {
        result = 'Запрос заблокирован политикой'; blockedBy = 'policy';
      }
      if (result === undefined) {
        const t = byName[tc.name];
        if (!t) result = `неизвестный инструмент: ${tc.name}`;
        else {
          try { result = String(await t.run(tc.args || {}, fetch)); }
          catch (e) {
            result = e instanceof TypeError
              ? 'ошибка инструмента: браузер заблокировал запрос (CORS) — в .zip работает'
              : `ошибка инструмента: ${e?.message || e}`;
          }
        }
      }
      ev({ type: 'tool_end', board: 'tools', name: tc.name, ms: Math.round(now() - ts), result: result.slice(0, 500), blocked: blockedBy });
      msgs.push({ role: 'tool', tool_call_id: tc.id, name: tc.name, content: result });
    }
  }
  return finish('Не удалось завершить задачу за отведённое число шагов.');
}
