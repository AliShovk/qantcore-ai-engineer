// node --test static/ai-engineer/test-ai-engineer.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, BOARDS, TEMPLATES, PARTNERS } from './boards.js?v=4';
import { initState, applyTemplate } from './model.js';
import { COST_DEFAULTS, hasTools, llmCalls, costRub, estimate } from './cost.js?v=1';
import { PRICES } from './prices.js';
import { prepare, runTurn } from './runner.js?v=1';
import { ruleIntent, normalizeIntent, intentToTemplate, parseJSONLoose } from './compose.js?v=1';
import { zipStore, crc32, envFileContent } from './exporter.js?v=2';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import zlib from 'node:zlib';

const boardById = (id) => BOARDS.find((b) => b.id === id);
const variantIds = (kind) => KINDS[kind].variants.map((v) => v.id);
const overlap = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2;

test('every template references existing boards, parts, slots and variants', () => {
  for (const tpl of TEMPLATES) {
    for (const [bid, spec] of Object.entries(tpl.boards || {})) {
      const b = boardById(bid);
      assert.ok(b, `${tpl.id}: unknown board ${bid}`);
      const partIds = b.parts.map((p) => p.id), slotIds = b.slots.map((s) => s.id);
      for (const pid of spec.keep || []) assert.ok(partIds.includes(pid), `${tpl.id}: keep unknown part ${bid}/${pid}`);
      for (const [pid, vid] of Object.entries(spec.variants || {})) {
        const p = b.parts.find((x) => x.id === pid) || { kind: b.slots.find((x) => x.id === pid)?.kind };
        assert.ok(p.kind, `${tpl.id}: variants unknown part ${bid}/${pid}`);
        assert.ok(variantIds(p.kind).includes(vid), `${tpl.id}: invalid variant ${bid}/${pid}:${vid}`);
      }
      for (const [sid, vid] of Object.entries(spec.fill || {})) {
        const s = b.slots.find((x) => x.id === sid);
        assert.ok(s, `${tpl.id}: fill unknown slot ${bid}/${sid}`);
        assert.ok(variantIds(s.kind).includes(vid), `${tpl.id}: fill invalid variant ${bid}/${sid}:${vid}`);
      }
      for (const [a, c] of spec.links || []) {
        assert.ok(partIds.includes(a) || slotIds.includes(a), `${tpl.id}: link unknown ${bid}/${a}`);
        assert.ok(partIds.includes(c) || slotIds.includes(c), `${tpl.id}: link unknown ${bid}/${c}`);
      }
    }
  }
});

for (const tpl of TEMPLATES) {
  test(`applyTemplate(${tpl.id}) produces a consistent state`, () => {
    const st = applyTemplate(initState(), tpl, null);
    assert.equal(st.template, tpl.id);
    for (const b of BOARDS) {
      const bs = st.boards[b.id];
      const uids = new Set();
      for (const o of [...bs.parts, ...bs.slots]) {
        assert.ok(!uids.has(o.uid), `${tpl.id}/${b.id}: duplicate uid ${o.uid}`);
        uids.add(o.uid);
      }
      for (const [a, c] of bs.links) {
        assert.ok(uids.has(a) && [...bs.parts].some((p) => p.uid === a), `${tpl.id}/${b.id}: link to missing ${a}`);
        assert.ok([...bs.parts].some((p) => p.uid === c), `${tpl.id}/${b.id}: link to missing ${c}`);
      }
      const boxes = [...bs.parts, ...bs.slots];
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++)
          assert.ok(!overlap(boxes[i], boxes[j]), `${tpl.id}/${b.id}: overlap ${boxes[i].uid} x ${boxes[j].uid}`);
    }
  });
}

test('carry-over keeps values only for same uid+kind+variant', () => {
  const prev = initState();
  const llm = prev.boards.core.parts.find((p) => p.uid === 'llm');
  llm.values.apiKey = 'k';
  const support = applyTemplate(initState(), TEMPLATES.find((t) => t.id === 'support-bot'), prev);
  assert.equal(support.boards.core.parts.find((p) => p.uid === 'llm').values.apiKey, 'k');
  const coder = applyTemplate(initState(), TEMPLATES.find((t) => t.id === 'coder'), prev);
  const llm2 = coder.boards.core.parts.find((p) => p.uid === 'llm');
  assert.equal(llm2.variant, 'anthropic');
  assert.notEqual(llm2.values.apiKey, 'k');
});

test('keyUrl / PARTNERS urls are https and partner ids exist', () => {
  for (const [kindId, k] of Object.entries(KINDS))
    for (const v of k.variants) {
      if (v.keyUrl) assert.match(v.keyUrl, /^https:\/\//, `${kindId}/${v.id} keyUrl`);
      for (const pid of v.partners || []) assert.ok(PARTNERS[pid], `${kindId}/${v.id}: unknown partner ${pid}`);
    }
  for (const [pid, p] of Object.entries(PARTNERS)) assert.match(p.url, /^https:\/\//, `PARTNERS ${pid}`);
});

test('crc32 matches zlib', () => {
  for (const s of ['', 'hello', 'агент — utf8 ✓', 'x'.repeat(5000)])
    assert.equal(crc32(new TextEncoder().encode(s)), zlib.crc32(Buffer.from(s, 'utf8')) >>> 0, `crc32(${JSON.stringify(s.slice(0, 20))})`);
});

test('zipStore output is readable by python zipfile', () => {
  const files = [
    { name: 'agent.json', data: '{"a":1}\n' },
    { name: '.env.example', data: 'KEY=\nPORT=8000\n' },
    { name: 'runtime/main.py', data: 'print("ok")\n' },
    { name: 'пустой/файл.txt', data: 'юникод ✓' },
  ];
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  const path = join(dir, 't.zip');
  writeFileSync(path, zipStore(files));
  const out = execFileSync('python3', ['-c', `
import zipfile, sys
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None, 'bad CRC'
names = z.namelist()
print('|'.join(names))
for n in names: print(len(z.read(n)), end=' ')
`, path], { encoding: 'utf8' });
  for (const f of files) assert.ok(out.includes(f.name), `missing ${f.name}`);
});

test('envFileContent picks env only with secrets checked', () => {
  const env = 'K=v\nPORT=8000\n', envExample = 'K=\nPORT=8000\n';
  assert.equal(envFileContent({ withSecrets: true, env, envExample }), env);
  assert.equal(envFileContent({ withSecrets: false, env: null, envExample }), envExample);
});

test('PRICES keys are llm variants and models are in opt lists', () => {
  const opts = (vid) => KINDS.llm.variants.find((x) => x.id === vid).fields.find((f) => f.k === 'model')?.opt || [];
  for (const [variant, models] of Object.entries(PRICES)) {
    assert.ok(KINDS.llm.variants.some((x) => x.id === variant), `PRICES key ${variant} is not an llm variant`);
    for (const model of Object.keys(models)) if (model !== '*') assert.ok(opts(variant).includes(model), `${variant}/${model} not in opt list`);
  }
});

test('costRub math (USD with fx, RUB without)', () => {
  const a = { inTok: 1500, outTok: 400, fx: 80 };
  assert.equal(costRub({ in: 2, out: 10, cur: 'USD' }, a, 6000), 6000 * (1500 * 2 + 400 * 10) / 1e6 * 80);
  assert.equal(costRub({ in: 65, out: 65, cur: 'RUB' }, a, 6000), 6000 * (1500 * 65 + 400 * 65) / 1e6);
  assert.equal(costRub(null, a, 6000), null);
});

test('llmCalls doubles with tools parts', () => {
  const a = { dialogs: 1000, msgs: 6 };
  const withTools = applyTemplate(initState(), TEMPLATES.find((t) => t.id === 'researcher'), null);
  assert.ok(hasTools(withTools));
  assert.equal(llmCalls(withTools, a), 12000);
  const noTools = initState();
  noTools.boards.tools.parts = [];
  assert.ok(!hasTools(noTools));
  assert.equal(llmCalls(noTools, a), 6000);
});

test('estimate options sorted and cover every priced pair', () => {
  const est = estimate(initState(), { ...COST_DEFAULTS, fx: 80 });
  const total = Object.values(PRICES).reduce((n, m) => n + Object.keys(m).filter((k) => k !== '*').length, 0);
  assert.equal(est.options.length, total);
  for (let i = 1; i < est.options.length; i++) assert.ok(est.options[i].rub >= est.options[i - 1].rub, 'options not sorted');
  assert.equal(est.current.variant, 'openai');
});

test('applyTemplate keeps prev.cost', () => {
  const prev = initState();
  prev.cost = { dialogs: 5000, fx: 90 };
  const next = applyTemplate(initState(), TEMPLATES.find((t) => t.id === 'full'), prev);
  assert.equal(next.cost.dialogs, 5000);
  assert.equal(next.cost.fx, 90);
});

// ---------- runner.js ----------
const jsonRes = (body, status = 200) => ({ ok: status < 400, status, text: async () => typeof body === 'string' ? body : JSON.stringify(body), json: async () => body });
const runState = (mut) => {
  const s = initState();
  const llm = s.boards.core.parts.find((p) => p.uid === 'llm');
  llm.values.apiKey = 'sk-test';
  mut?.(s);
  return s;
};

test('runner: openai tool loop, events, usage totals, serialized tool_calls', async () => {
  const st = runState((s) => {
    s.boards.tools.parts.find((p) => p.kind === 'search').values = { apiKey: 'tvly' };
  });
  const cfg = prepare(st);
  assert.ok(cfg.ok);
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes('tavily')) return jsonRes({ results: [{ title: 'T', url: 'u', content: 's' }] });
    const body = JSON.parse(opts.body);
    if (calls.filter((c) => c.url.includes('chat/completions')).length === 1)
      return jsonRes({ choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'web_search', arguments: '{"query":"q"}' } }] } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
    // второй запрос: tool message соответствует tool_call_id и assistant tool_calls сериализованы в формате OpenAI
    const tm = body.messages.find((m) => m.role === 'tool');
    assert.equal(tm.tool_call_id, 'c1');
    assert.equal(tm.name, 'web_search');
    const am = body.messages.find((m) => m.role === 'assistant' && m.tool_calls);
    assert.equal(am.tool_calls[0].type, 'function');
    assert.equal(am.tool_calls[0].function.name, 'web_search');
    assert.equal(am.tool_calls[0].function.arguments, '{"query":"q"}');
    return jsonRes({ choices: [{ message: { content: 'готово', tool_calls: [] } }], usage: { prompt_tokens: 20, completion_tokens: 7 } });
  };
  const events = [];
  const hist = [];
  const reply = await runTurn(cfg, hist, 'привет', { fetch, onEvent: (e) => events.push(e), now: (() => { let t = 0; return () => (t += 10); })() });
  assert.equal(reply, 'готово');
  assert.deepEqual(events.map((e) => e.type), ['start', 'guard', 'llm_start', 'llm_end', 'tool_start', 'tool_end', 'llm_start', 'llm_end', 'final']);
  assert.equal(events.at(-1).totals.in, 30);
  assert.equal(events.at(-1).totals.out, 12);
  assert.equal(hist.length, 2);
});

test('runner: anthropic endpoint, headers, system top-level, tool round-trip', async () => {
  const st = runState((s) => {
    const llm = s.boards.core.parts.find((p) => p.uid === 'llm');
    llm.variant = 'anthropic'; llm.values = { apiKey: 'sk-ant', model: 'claude-sonnet-4-5' };
  });
  const cfg = prepare(st);
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, opts });
    if (calls.length === 1)
      return jsonRes({ content: [{ type: 'tool_use', id: 't1', name: 'unknown_tool', input: {} }], usage: { input_tokens: 3, output_tokens: 2 } });
    return jsonRes({ content: [{ type: 'text', text: 'ответ' }], usage: { input_tokens: 4, output_tokens: 2 } });
  };
  const reply = await runTurn(cfg, [], 'hi', { fetch, onEvent: () => {} });
  assert.equal(reply, 'ответ');
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].opts.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(calls[0].opts.headers['x-api-key'], 'sk-ant');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(typeof body.system, 'string');
  assert.ok(!body.messages.some((m) => m.role === 'system'));
  const conv2 = JSON.parse(calls[1].opts.body);
  const toolUse = conv2.messages.find((m) => m.role === 'assistant' && Array.isArray(m.content));
  assert.equal(toolUse.content[0].type, 'tool_use');
  const toolRes = conv2.messages.find((m) => m.role === 'user' && Array.isArray(m.content));
  assert.equal(toolRes.content[0].type, 'tool_result');
  assert.equal(toolRes.content[0].tool_use_id, 't1');
});

test('runner: guardrail deny makes no LLM call', async () => {
  const st = runState();
  const cfg = prepare(st);
  assert.ok(cfg.deny.length);
  cfg.deny = ['запрет'];
  const fetch = async () => { throw new Error('fetch must not be called'); };
  const events = [];
  const reply = await runTurn(cfg, [], 'это запрет тут', { fetch, onEvent: (e) => events.push(e) });
  assert.equal(reply, 'Запрос заблокирован политикой');
  assert.deepEqual(events.map((e) => e.type), ['start', 'guard', 'final']);
});

test('runner: approve() false → Отклонено человеком, tool not called', async () => {
  const st = runState((s) => {
    s.boards.tools.parts.find((p) => p.kind === 'search').values = { apiKey: 'tvly' };
  });
  const cfg = prepare(st);
  cfg.actions = ['web_search'];
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push(url);
    return jsonRes({ choices: [{ message: { content: null, tool_calls: [{ id: 'c1', function: { name: 'web_search', arguments: '{}' } }] } }] });
  };
  const events = [];
  const hist = [];
  // maxSteps исчерпается: каждый шаг возвращает tool_call, инструмент отклонён
  const reply = await runTurn(cfg, hist, 'hi', { fetch, onEvent: (e) => events.push(e), approve: async () => false });
  const te = events.find((e) => e.type === 'tool_end');
  assert.equal(te.blocked, 'approval');
  assert.equal(te.result, 'Отклонено человеком');
  assert.ok(!calls.some((u) => u.includes('tavily')));
});

test('runner: HTTP 401 → error event + throw LLM: 401', async () => {
  const st = runState();
  const cfg = prepare(st);
  const fetch = async () => jsonRes('{"error":"bad key"}', 401);
  const events = [];
  await assert.rejects(
    runTurn(cfg, [], 'hi', { fetch, onEvent: (e) => events.push(e) }),
    /^Error: LLM: 401/,
  );
  const err = events.find((e) => e.type === 'error');
  assert.ok(err.message.startsWith('LLM: 401'));
});

test('runner: prepare — gemini unsupported, missing key fixUid, brave unavailable, maxSteps cap', () => {
  const st = initState();
  const llm = st.boards.core.parts.find((p) => p.uid === 'llm');
  llm.variant = 'gemini'; llm.values = { apiKey: 'k', model: 'gemini-3.8-flash' };
  const r1 = prepare(st);
  assert.equal(r1.ok, false);
  llm.variant = 'openai'; llm.values = { model: 'gpt-4.1' };
  const r2 = prepare(st);
  assert.equal(r2.ok, false);
  assert.equal(r2.fixUid, 'llm');
  llm.values = { apiKey: 'k', model: 'gpt-4.1' };
  const search = st.boards.tools.parts.find((p) => p.kind === 'search');
  search.variant = 'brave'; search.values = { apiKey: 'k' };
  st.boards.orchestrator.parts.find((p) => p.uid === 'planner').values.maxSteps = 40;
  const r3 = prepare(st);
  assert.equal(r3.maxSteps, 25);
  assert.ok(r3.unavailable.some((u) => /Brave/i.test(u)));
});

test('runner: maxSteps exhaustion message', async () => {
  const st = runState();
  const cfg = prepare(st);
  cfg.maxSteps = 2;
  const fetch = async () => jsonRes({ choices: [{ message: { content: null, tool_calls: [{ id: 'c', function: { name: 'nope', arguments: '{}' } }] } }] });
  const reply = await runTurn(cfg, [], 'hi', { fetch, onEvent: () => {} });
  assert.equal(reply, 'Не удалось завершить задачу за отведённое число шагов.');
});

// ---------- compose.js ----------
const EX = [
  'Бот для салона красоты в Telegram: отвечает на вопросы по прайсу и записывает клиентов в Google Таблицу',
  'Помощник юриста: отвечает по нашим договорам и PDF-регламентам в чате на сайте',
  'Исследователь: каждый день ищет новости по AI в интернете и присылает отчёт в Telegram',
  'Поддержка интернет-магазина ВКонтакте и на сайте, проверяет статус заказа в 1С, на YandexGPT',
];

test('ruleIntent example 1: telegram, http, guard+approval, Google Таблицы, kb files', () => {
  const { intent } = ruleIntent(EX[0]);
  assert.ok(intent.channels.includes('telegram'));
  assert.ok(intent.tools.includes('http'));
  for (const c of ['guard', 'approval', 'budget', 'tracing']) assert.ok(intent.control.includes(c), c);
  assert.ok(intent.integrations.some((i) => i.name === 'Google Таблицы'));
  assert.equal(intent.kb, 'files');
});

test('ruleIntent example 2: kb files, only webchat', () => {
  const { intent } = ruleIntent(EX[1]);
  assert.equal(intent.kb, 'files');
  assert.deepEqual(intent.channels, ['webchat']);
});

test('ruleIntent example 3: search, planner, telegram', () => {
  const { intent } = ruleIntent(EX[2]);
  assert.ok(intent.tools.includes('search'));
  assert.equal(intent.orchestrator, 'planner');
  assert.ok(intent.channels.includes('telegram'));
});

test('ruleIntent example 4: yandexgpt, vk+webchat, 1С; «сделай максимум» не даёт max', () => {
  const { intent } = ruleIntent(EX[3]);
  assert.equal(intent.llm, 'yandexgpt');
  for (const c of ['vk', 'webchat']) assert.ok(intent.channels.includes(c), c);
  assert.ok(intent.integrations.some((i) => i.name === '1С'));
  const { intent: i2 } = ruleIntent('сделай максимум');
  assert.ok(!i2.channels.includes('max'));
});

test('ruleIntent names: segment before separator wins', () => {
  assert.equal(ruleIntent(EX[0]).intent.name, 'Бот для салона красоты в Telegram');
  assert.equal(ruleIntent(EX[1]).intent.name, 'Помощник юриста');
  assert.equal(ruleIntent(EX[2]).intent.name, 'Исследователь');
  assert.ok(ruleIntent(EX[3]).intent.name === 'Поддержка интернет-магазина ВКонтакте и на сайте' || ruleIntent(EX[3]).intent.name.startsWith('Агент: '));
});

test('compose: tpl uids exist, applyTemplate succeeds, prompt rules set', () => {
  for (const text of EX) {
    const { intent } = ruleIntent(text);
    const { tpl } = intentToTemplate(intent);
    const base = initState();
    const ids = new Set();
    for (const b of BOARDS) for (const o of [...base.boards[b.id].parts, ...base.boards[b.id].slots]) ids.add(`${b.id}/${o.uid}`);
    for (const [bid, spec] of Object.entries(tpl.boards)) {
      for (const k of spec.keep || []) assert.ok(ids.has(`${bid}/${k}`), `${bid}/${k}`);
      for (const k of Object.keys(spec.variants || {})) assert.ok(ids.has(`${bid}/${k}`), `var ${bid}/${k}`);
      for (const k of Object.keys(spec.fill || {})) assert.ok(base.boards[bid].slots.some((s) => s.uid === k), `fill ${bid}/${k}`);
    }
    for (const [bid, m] of Object.entries(tpl.values || {}))
      for (const uid of Object.keys(m)) assert.ok(ids.has(`${bid}/${uid}`), `val ${bid}/${uid}`);
    const st = applyTemplate(initState(), tpl, null);
    assert.equal(st.boards.core.parts.find((p) => p.uid === 'prompt').values.rules, intent.system);
  }
});

test('compose: prev key preserved, prompt rules overridden', () => {
  const { intent } = ruleIntent(EX[0]);
  const { tpl } = intentToTemplate(intent);
  const prev = initState();
  prev.boards.core.parts.find((p) => p.uid === 'llm').values.apiKey = 'sk-prev';
  const st = applyTemplate(initState(), tpl, prev);
  assert.equal(st.boards.core.parts.find((p) => p.uid === 'llm').values.apiKey, 'sk-prev');
  assert.equal(st.boards.core.parts.find((p) => p.uid === 'prompt').values.rules, intent.system);
});

test('normalizeIntent filters junk; parseJSONLoose parses fenced+prose', () => {
  const n = normalizeIntent({ channels: ['telegram', 'bogus', 5, 'telegram'], llm: 'zzz', tools: [1, 'db'], control: 'x', orchestrator: 'weird', integrations: [{ name: 'a', how: 'ftp' }, { name: 'b', how: 'http' }], name: '  x '.repeat(30), system: null });
  assert.deepEqual(n.channels, ['telegram']);
  assert.equal(n.llm, null);
  assert.deepEqual(n.tools, ['db']);
  assert.equal(n.orchestrator, 'simple');
  assert.deepEqual(n.integrations, [{ name: 'b', how: 'http' }]);
  assert.equal(normalizeIntent({ channels: [] }).channels[0], 'webchat');
  assert.equal(normalizeIntent(null).channels[0], 'webchat');
  const j = parseJSONLoose('Вот ответ:\n```json\n{"a":1}\n```\nхвост');
  assert.equal(j.a, 1);
  assert.throws(() => parseJSONLoose('нет джейсона'));
});
