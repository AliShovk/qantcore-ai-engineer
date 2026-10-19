/*! Qantcore AI Engineer — первоисточник: https://qantcore.space/ai-engineer/
 *  (c) 2026 Qantcore. Если этот файл открыт на другом домене — перед вами копия.
 *  Оригинал, история и лицензия: см. ссылку выше. */
// «Опишите агента словами» — текст → intent → tpl → applyTemplate. Чистый модуль.

export const INTENT_ENUMS = {
  channels: ['telegram', 'webchat', 'api', 'email', 'webhook', 'vk', 'max', 'slack'],
  llm: ['openai', 'anthropic', 'gemini', 'yandexgpt', 'gigachat', 'qwen', 'deepseek', 'openrouter', 'ollama'],
  kb: ['files', 'site', 'git'],
  tools: ['search', 'browser', 'http', 'db', 'sandbox', 'mcp'],
  orchestrator: ['simple', 'planner'],
  control: ['guard', 'approval', 'budget', 'tracing', 'evals', 'rate'],
  how: ['http', 'webhook', 'db', 'mcp'],
};

export const COMPOSE_PROMPT = `Ты проектируешь AI-агента в no-code конструкторе Qantcore. По описанию пользователя верни ТОЛЬКО JSON-объект, без пояснений и без markdown, строго по схеме:
{"name": "название агента, до 40 символов",
 "channels": ["telegram"|"webchat"|"api"|"email"|"webhook"|"vk"|"max"|"slack"],
 "llm": "openai"|"anthropic"|"gemini"|"yandexgpt"|"gigachat"|"qwen"|"deepseek"|"openrouter"|"ollama"|null,
 "kb": "files"|"site"|"git"|null,
 "summary": true|false,
 "tools": ["search"|"browser"|"http"|"db"|"sandbox"|"mcp"],
 "orchestrator": "simple"|"planner",
 "control": ["guard"|"approval"|"budget"|"tracing"|"evals"|"rate"],
 "integrations": [{"name": "внешний сервис", "how": "http"|"webhook"|"db"|"mcp"}],
 "system": "системный промпт агента на русском, 3–6 предложений: роль, задачи, тон, ограничения, когда звать человека"}
Правила:
- Выбирай минимально достаточный набор деталей.
- "llm" — только если пользователь явно назвал модель или требование (локально, 152-ФЗ, дёшево); иначе null.
- "kb" — если агент отвечает по документам, файлам, сайту или коду компании.
- "summary": true — если агент должен помнить клиента между диалогами.
- Внешние сервисы (CRM, таблицы, запись, оплата, учёт) — добавь "http" в tools и сервис в integrations.
- Если агент меняет данные, записывает, оплачивает или удаляет — добавь "approval".
- Если канал публичный (telegram, webchat, vk, max, email) — добавь "guard".
- "planner" — для многошаговых задач: исследования, отчёты, анализ, написание кода.
- Всегда добавляй "budget" и "tracing".
- Не выдумывай сервисы и требования, которых нет в описании.`;

export function parseJSONLoose(s) {
  const t = String(s).replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('нет JSON-объекта');
  return JSON.parse(t.slice(a, b + 1));
}

export function normalizeIntent(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const arr = (v, enum_) => {
    const out = [];
    for (const x of Array.isArray(v) ? v : [])
      if (typeof x === 'string' && enum_.includes(x) && !out.includes(x)) out.push(x);
    return out;
  };
  const channels = arr(r.channels, INTENT_ENUMS.channels);
  const tools = arr(r.tools, INTENT_ENUMS.tools);
  const control = arr(r.control, INTENT_ENUMS.control);
  const integrations = (Array.isArray(r.integrations) ? r.integrations : [])
    .filter((x) => x && typeof x.name === 'string' && INTENT_ENUMS.how.includes(x.how))
    .slice(0, 6)
    .map((x) => ({ name: x.name.trim(), how: x.how }));
  return {
    name: String(r.name || '').trim().slice(0, 40),
    channels: channels.length ? channels : ['webchat'],
    llm: INTENT_ENUMS.llm.includes(r.llm) ? r.llm : null,
    kb: INTENT_ENUMS.kb.includes(r.kb) ? r.kb : null,
    summary: !!r.summary,
    tools,
    orchestrator: INTENT_ENUMS.orchestrator.includes(r.orchestrator) ? r.orchestrator : 'simple',
    control,
    integrations,
    system: String(r.system || '').trim().slice(0, 2000),
  };
}

const norm = (text) => String(text || '').toLowerCase().replace(/ё/g, 'е');

export function ruleIntent(text) {
  const t = norm(text);
  const why = [];
  const W = (board, uid, re) => { const m = t.match(re); if (m) why.push({ board, uid, reason: `нашёл «${m[0]}»` }); return !!m; };

  const channels = [];
  const seen = new Set();
  const add = (c) => { if (!seen.has(c)) { seen.add(c); channels.push(c); } };
  if (W('channels', 'telegram', /телеграм|telegram|\bтг\b|\btg\b/)) add('telegram');
  if (W('channels', 'webchat', /на сайте|виджет|сайт[аеу]?\b|website|web ?chat/)) add('webchat');
  if (W('channels', 'messenger', /вконтакте|\bвк\b|\bvk\b/)) add('vk');
  if (W('channels', 'messenger', /мессенджер[еа]? max|\bmax\b/)) add('max');
  if (W('channels', 'messenger', /slack|слак/)) add('slack');
  if (W('channels', 'email', /почт|e-?mail|письм/)) add('email');
  if (W('channels', 'webhook', /вебхук|webhook/)) add('webhook');
  if (W('channels', 'gateway', /\bapi\b/)) add('api');
  if (!channels.length) channels.push('webchat');

  const notes = [];
  let llm = null;
  const LLM = [
    [/яндекс|yandex/, 'yandexgpt'], [/гигачат|gigachat|сбер/, 'gigachat'], [/claude|клод|anthropic/, 'anthropic'],
    [/gemini|джемини/, 'gemini'], [/deepseek|дипсик/, 'deepseek'], [/qwen|квен/, 'qwen'],
    [/ollama|локальн|без интернета|на сво[её]м сервере/, 'ollama'], [/openai|chatgpt|\bgpt/, 'openai'],
    [/дешев|бюджетн|недорог/, 'deepseek'],
  ];
  for (const [re, v] of LLM) if (W('core', 'llm', re)) { llm = v; break; }
  if (!llm && W('core', 'llm', /152-?фз|персональн\w* данн/)) {
    llm = 'yandexgpt';
    notes.push('Для 152-ФЗ выбрана YandexGPT — данные остаются в РФ');
  }

  let kb = null;
  if (W('memory', 'kb', /документ|файл|pdf|база знаний|инструкц|регламент|прайс|faq|договор/)) kb = 'files';
  else if (W('memory', 'kb', /по (материалам )?сайт|страниц[аы] сайта/)) kb = 'site';
  else if (W('memory', 'kb', /репозитор|кодовой баз/)) kb = 'git';

  const summary = W('memory', 'summary', /помнит|запоминает|истори[юя] клиент|долг\w* памят/);

  const tools = [];
  const T = (re, name, uid) => { if (W('tools', uid || name, re)) tools.push(name); };
  T(/интернет|поиск в сети|новост|гугл|исследу|web search/, 'search');
  T(/читает (страниц|сайт)|парс|по ссылк/, 'browser');
  T(/баз[аеуы] данных|sql|postgres|mysql|clickhouse/, 'db');
  T(/пишет код|выполняет код|python|скрипт|тест/, 'sandbox');
  T(/\bmcp\b|github/, 'mcp');
  T(/\bapi\b|crm|таблиц|sheets|битрикс|bitrix|amo ?crm|амо|1с|1c|yclients|запис\w* (клиент|на прием)|бронир|заказ|оплат|iiko/, 'http');

  const integrations = [];
  const I = (name, re, how = 'http') => { if (W('tools', 'http', re)) integrations.push({ name, how }); };
  I('Google Таблицы', /google ?(таблиц|sheets)|гугл ?таблиц/);
  I('Битрикс24', /битрикс|bitrix/);
  I('amoCRM', /amo ?crm|амо ?срм/);
  I('1С', /(?<![\p{L}\p{N}])1[сc](?![\p{L}\p{N}])/u);
  I('YClients', /yclients/);
  I('iiko', /iiko/);
  I('GitHub', /github/, 'mcp');
  for (const i of integrations) {
    if (i.how === 'mcp' && !tools.includes('mcp')) tools.push('mcp');
    if (i.how !== 'mcp' && !tools.includes('http')) tools.push('http');
  }

  const orchestrator = (W('orchestrator', 'planner', /исслед|отч[её]т|план|сложн|многошаг|несколько шагов|анализ/) || tools.includes('sandbox')) ? 'planner' : 'simple';

  const PUBLIC = ['telegram', 'webchat', 'vk', 'max', 'slack', 'email'];
  const control = ['budget', 'tracing'];
  if (channels.some((c) => PUBLIC.includes(c))) control.unshift('guard');
  if (W('control', 'approval', /подтвержд|одобр|согласов|оплат|платеж|удал/) || tools.includes('db') || tools.includes('sandbox') || tools.includes('http')) control.push('approval');
  if (W('control', 'evals', /качеств|тестир\w* ответ|eval/)) control.push('evals');
  if (channels.some((c) => PUBLIC.includes(c)) && W('control', 'rate', /спам|нагрузк|много клиентов/)) control.push('rate');

  const seg = String(text).split(/[:.,;]|—| - /)[0].trim();
  const STOP = new Set(['в', 'на', 'и', 'для', 'по', 'с', 'со', 'к', 'о', 'об', 'у', 'из', 'от', 'а', 'но', 'или', 'the', 'a', 'for', 'in', 'on', 'and']);
  let name;
  if (seg.length >= 2 && seg.length <= 40) name = seg;
  else {
    const words = String(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).slice(0, 5);
    while (words.length > 1 && STOP.has(words[words.length - 1].toLowerCase())) words.pop();
    name = ('Агент: ' + words.join(' ')).slice(0, 40);
  }

  const approval = control.includes('approval');
  const names = integrations.map((i) => i.name);
  const system = `Ты — AI-ассистент. Задача: ${String(text).trim().slice(0, 300)}. Отвечай кратко, вежливо и по делу на языке пользователя.` +
    (kb ? ' Опирайся на базу знаний; если ответа в ней нет — честно скажи и предложи связаться с человеком.' : '') +
    (approval ? ' Перед действиями, которые меняют данные или тратят деньги, запроси подтверждение.' : '') +
    (names.length ? ` Для работы с ${names.join(', ')} используй инструмент вызова API.` : '');

  const why2 = why.filter((w) => w.reason !== 'нашёл «»');
  return { intent: { name, channels, llm, kb, summary, tools, orchestrator, control, integrations, system }, why: why2, notes };
}

const CHANNEL_UID = { telegram: 'telegram', webchat: 'webchat', email: 'email', webhook: 'webhook', api: 'gateway' };
const MESSENGER_VARIANT = { vk: 'vk', max: 'max', slack: 'slack' };
const MESSENGER_NAME = { vk: 'ВКонтакте', max: 'MAX', slack: 'Slack' };
const TOOL_UID = { search: 'search', browser: 'browser', http: 'http', db: 'db', sandbox: 'sandbox', mcp: 'mcp' };
const CONTROL_UID = { guard: 'guard', approval: 'approval', budget: 'budget', tracing: 'tracing', evals: 'evals' };
const LLM_LABEL = { gigachat: 'GigaChat', yandexgpt: 'YandexGPT', gemini: 'Google Gemini' };

export function intentToTemplate(intent, notes0 = []) {
  const notes = [...notes0];
  const boards = {};

  const keep = ['gateway'];
  const fill = {};
  let messengerUsed = false;
  for (const c of intent.channels) {
    if (CHANNEL_UID[c]) { if (c !== 'api') keep.push(CHANNEL_UID[c]); }
    else if (MESSENGER_VARIANT[c]) {
      if (!messengerUsed) { fill.messenger = MESSENGER_VARIANT[c]; messengerUsed = true; }
      else notes.push(`${MESSENGER_NAME[c]} — добавьте вторую деталь вручную`);
    }
  }
  boards.channels = { keep, ...(Object.keys(fill).length ? { fill } : {}) };

  const cKeep = intent.control.filter((c) => CONTROL_UID[c]).map((c) => CONTROL_UID[c]);
  const cFill = {};
  if (intent.control.includes('rate')) cFill.rate = 'simple';
  boards.control = { keep: cKeep, ...(Object.keys(cFill).length ? { fill: cFill } : {}) };

  boards.orchestrator = intent.orchestrator === 'planner'
    ? { keep: ['planner', 'executor', 'critic', 'queue'], variants: { executor: 'sequential', critic: 'reflection' } }
    : { keep: ['router', 'executor'], variants: { executor: 'sequential' } };

  boards.core = { keep: ['llm', 'prompt', 'params', 'context'], ...(intent.llm ? { variants: { llm: intent.llm } } : {}) };

  const mKeep = ['buffer'];
  const mVariants = {};
  if (intent.kb) { mKeep.push('kb', 'vector', 'embed'); mVariants.kb = intent.kb; }
  if (intent.summary) mKeep.push('summary');
  boards.memory = { keep: mKeep, ...(Object.keys(mVariants).length ? { variants: mVariants } : {}) };

  const toolSet = new Set(intent.tools);
  for (const i of intent.integrations) {
    if (i.how === 'mcp') toolSet.add('mcp');
    else if (i.how === 'db') toolSet.add('db');
    else toolSet.add('http');
  }
  const tKeep = toolSet.size ? ['bus', ...[...toolSet].filter((t) => TOOL_UID[t]).map((t) => TOOL_UID[t])] : [];
  boards.tools = { keep: tKeep };

  const values = { core: { prompt: { role: intent.name.replace(/^Агент: /, ''), rules: intent.system } } };
  if (intent.control.includes('approval')) {
    const sanitize = (n) => String(n || 'call_api').replace(/[^a-zA-Z0-9_]/g, '_');
    const names = [];
    // рантаймные имена инструментов (tools.py/runner.js): http → sanitize(cfg.name)
    if (toolSet.has('http')) names.push(sanitize('my_api'));
    if (names.length) values.control = { approval: { actions: names.join('\n') } };
  }

  for (const i of intent.integrations)
    notes.push(`«${i.name}» — подключите через деталь «REST API» на плате Инструменты: вставьте URL API/вебхука и ключ.`);
  if (intent.llm && LLM_LABEL[intent.llm])
    notes.push(`«${LLM_LABEL[intent.llm]}» не вызывается из браузера — живой запуск через .zip.`);

  return { tpl: { id: 'composed', name: intent.name, desc: intent.name, boards, values }, notes };
}
