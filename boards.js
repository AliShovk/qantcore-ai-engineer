/*! Qantcore AI Engineer — первоисточник: https://qantcore.space/ai-engineer/
 *  (c) 2026 Qantcore. Если этот файл открыт на другом домене — перед вами копия.
 *  Оригинал, история и лицензия: см. ссылку выше. */
// Каталог деталей и платы агентской системы «AI Инженер».
// Поле: k — ключ, t — тип (secret|text|url|select|number|textarea), req — обязательно, opt — варианты, ph — подсказка, def — значение по умолчанию.

const key = (label, ph = '', k = 'apiKey') => ({ k, label, t: 'secret', req: true, ph });
const model = (def, opt) => ({ k: 'model', label: 'Модель', t: 'text', req: true, def, opt });
const url = (label, ph, k = 'url', req = true) => ({ k, label, t: 'url', req, ph });

export const KINDS = {
  llm: { label: 'LLM-провайдер', short: 'LLM', variants: [
    { id: 'openai', name: 'OpenAI', desc: 'GPT-модели через OpenAI API.', keyUrl: 'https://platform.openai.com/api-keys', catalog: 'chatgpt-openai', partners: ['polza', 'bothub', 'gptunnel'], partnerText: 'Нет зарубежной карты? Доступ к моделям с оплатой в рублях:', fields: [key('API-ключ', 'sk-…'), model('gpt-6.1-sol', ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna', 'gpt-4.1', 'gpt-4.1-mini']), url('Base URL', 'https://api.openai.com/v1', 'baseUrl', false)] },
    { id: 'anthropic', name: 'Anthropic Claude', desc: 'Модели Claude через Messages API.', keyUrl: 'https://console.anthropic.com/settings/keys', catalog: 'claude-anthropic', partners: ['polza', 'bothub', 'gptunnel'], partnerText: 'Нет зарубежной карты? Доступ к моделям с оплатой в рублях:', fields: [key('API-ключ', 'sk-ant-…'), model('claude-sonnet-4-5', ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'])] },
    { id: 'gemini', name: 'Google Gemini', desc: 'Gemini через Google AI Studio.', keyUrl: 'https://aistudio.google.com/apikey', catalog: 'google-gemini', partners: ['polza', 'bothub', 'gptunnel'], partnerText: 'Нет зарубежной карты? Доступ к моделям с оплатой в рублях:', fields: [key('API-ключ', 'AIza…'), model('gemini-3.8-flash', ['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-4-argon', 'gemini-3.5-flash-lite', 'gemini-2.5-pro', 'gemini-2.5-flash'])] },
    { id: 'yandexgpt', name: 'YandexGPT', desc: 'Yandex AI Studio: YandexGPT Pro / Lite.', keyUrl: 'https://yandex.cloud/ru/docs/iam/operations/api-key/create', catalog: 'yandex-ai-studio', fields: [key('API-ключ', 'AQVN…'), { k: 'folderId', label: 'ID каталога', t: 'text', req: true, ph: 'b1g…' }, model('yandexgpt', ['yandexgpt', 'yandexgpt-lite'])] },
    { id: 'gigachat', name: 'GigaChat', desc: 'GigaChat API (Сбер).', keyUrl: 'https://developers.sber.ru/studio', fields: [key('Authorization key', 'base64…'), { k: 'scope', label: 'Scope', t: 'select', req: true, def: 'GIGACHAT_API_PERS', opt: ['GIGACHAT_API_PERS', 'GIGACHAT_API_B2B', 'GIGACHAT_API_CORP'] }, model('GigaChat-2-Max', ['GigaChat-2', 'GigaChat-2-Pro', 'GigaChat-2-Max'])] },
    { id: 'qwen', name: 'Qwen (DashScope)', desc: 'Qwen через Alibaba Cloud Model Studio.', keyUrl: 'https://www.alibabacloud.com/help/en/model-studio/get-api-key', catalog: 'qwen-alibaba', fields: [key('API-ключ', 'sk-…'), model('qwen-plus', ['qwen-max', 'qwen-plus', 'qwen-flash'])] },
    { id: 'deepseek', name: 'DeepSeek', desc: 'DeepSeek API (OpenAI-совместимый).', keyUrl: 'https://platform.deepseek.com/api_keys', catalog: 'deepseek-llm', fields: [key('API-ключ', 'sk-…'), model('deepseek-flash', ['deepseek-flash', 'deepseek-v4-pro'])] },
    { id: 'openrouter', name: 'OpenRouter', desc: 'Сотни моделей через один ключ.', keyUrl: 'https://openrouter.ai/keys', partners: ['polza', 'bothub', 'gptunnel'], partnerText: 'Нет зарубежной карты? Доступ к моделям с оплатой в рублях:', fields: [key('API-ключ', 'sk-or-…'), model('openai/gpt-4.1')] },
    { id: 'ollama', name: 'Ollama (локально)', desc: 'Локальная модель на своём сервере, без ключа.', keyUrl: 'https://ollama.com/download', catalog: 'ollama', partners: ['reg-ru'], partnerText: 'Сервер для локальной модели:', fields: [url('Адрес сервера', 'http://localhost:11434', 'baseUrl'), model('qwen3:8b', ['qwen3:8b', 'llama3.1:8b', 'gemma3:12b'])] },
  ] },
  prompt: { label: 'Системный промпт', short: 'PROMPT', variants: [
    { id: 'system', name: 'Роль и правила', desc: 'Кто такой агент, как отвечает, чего не делает.', fields: [{ k: 'role', label: 'Роль агента', t: 'text', req: true, def: 'AI-инженер: проектирует, пишет и проверяет код' }, { k: 'rules', label: 'Правила', t: 'textarea', req: false, ph: 'Отвечай по-русски. Сначала план, потом действия…' }] },
    { id: 'template', name: 'Шаблон с переменными', desc: 'Промпт с подстановкой {контекст}, {задача}.', fields: [{ k: 'template', label: 'Шаблон', t: 'textarea', req: true, def: 'Задача: {задача}\nКонтекст: {контекст}' }] },
  ] },
  params: { label: 'Параметры генерации', short: 'PARAMS', variants: [
    { id: 'sampling', name: 'Сэмплинг', desc: 'Температура и лимит токенов ответа.', fields: [{ k: 'temperature', label: 'Температура', t: 'number', req: true, def: '0.3' }, { k: 'maxTokens', label: 'Макс. токенов', t: 'number', req: true, def: '4096' }] },
    { id: 'json', name: 'Строгий JSON', desc: 'Ответ только по JSON-схеме.', fields: [{ k: 'schema', label: 'JSON-схема', t: 'textarea', req: true, def: '{"type":"object"}' }] },
  ] },
  context: { label: 'Контекстное окно', short: 'CONTEXT', variants: [
    { id: 'window', name: 'Скользящее окно', desc: 'Сколько истории подавать в модель.', fields: [{ k: 'tokens', label: 'Лимит контекста, токенов', t: 'number', req: true, def: '128000' }] },
    { id: 'compress', name: 'Сжатие истории', desc: 'Старые сообщения сворачиваются в выжимку.', fields: [{ k: 'keep', label: 'Последних сообщений целиком', t: 'number', req: true, def: '12' }] },
  ] },
  cache: { label: 'Кэш ответов', short: 'CACHE', variants: [
    { id: 'semantic', name: 'Семантический кэш', desc: 'Похожие вопросы — ответ из кэша, без вызова модели.', fields: [{ k: 'ttl', label: 'TTL, минут', t: 'number', req: true, def: '60' }] },
    { id: 'redis', name: 'Redis', desc: 'Кэш в Redis.', fields: [url('Redis URL', 'redis://…', 'url')] },
  ] },
  vectordb: { label: 'Векторная база', short: 'VECTOR DB', variants: [
    { id: 'qdrant', name: 'Qdrant', desc: 'Векторный поиск, облако или свой сервер.', keyUrl: 'https://cloud.qdrant.io', fields: [url('URL', 'https://…qdrant.io:6333'), key('API-ключ', '', 'apiKey'), { k: 'collection', label: 'Коллекция', t: 'text', req: true, def: 'agent_memory' }] },
    { id: 'pgvector', name: 'PostgreSQL + pgvector', desc: 'Векторы прямо в Postgres.', fields: [key('DSN', 'postgres://user:pass@host:5432/db', 'dsn'), { k: 'table', label: 'Таблица', t: 'text', req: true, def: 'embeddings' }] },
    { id: 'chroma', name: 'Chroma', desc: 'Лёгкая локальная векторная БД.', keyUrl: 'https://www.trychroma.com', fields: [url('URL', 'http://localhost:8000'), { k: 'collection', label: 'Коллекция', t: 'text', req: true, def: 'agent_memory' }] },
    { id: 'pinecone', name: 'Pinecone', desc: 'Управляемая векторная БД.', keyUrl: 'https://app.pinecone.io', fields: [key('API-ключ'), { k: 'index', label: 'Индекс', t: 'text', req: true, def: 'agent-memory' }] },
  ] },
  embeddings: { label: 'Эмбеддинги', short: 'EMBED', variants: [
    { id: 'openai-emb', name: 'OpenAI Embeddings', desc: 'text-embedding-3-small/large.', keyUrl: 'https://platform.openai.com/api-keys', partners: ['polza', 'bothub', 'gptunnel'], partnerText: 'Нет зарубежной карты? Доступ к моделям с оплатой в рублях:', fields: [key('API-ключ', 'sk-…'), model('text-embedding-3-small', ['text-embedding-3-small', 'text-embedding-3-large'])] },
    { id: 'yandex-emb', name: 'Yandex Embeddings', desc: 'Эмбеддинги Yandex AI Studio.', keyUrl: 'https://yandex.cloud/ru/docs/iam/operations/api-key/create', fields: [key('API-ключ', 'AQVN…'), { k: 'folderId', label: 'ID каталога', t: 'text', req: true, ph: 'b1g…' }] },
    { id: 'bge', name: 'BGE-M3 (локально)', desc: 'Открытая мультиязычная модель на своём сервере.', fields: [url('Адрес сервера', 'http://localhost:8080')] },
  ] },
  buffer: { label: 'Краткосрочная память', short: 'BUFFER', variants: [
    { id: 'window', name: 'Буфер диалога', desc: 'Последние N сообщений сессии.', fields: [{ k: 'size', label: 'Сообщений', t: 'number', req: true, def: '20' }] },
    { id: 'redis', name: 'Redis-сессии', desc: 'История сессий в Redis.', fields: [url('Redis URL', 'redis://…')] },
  ] },
  summary: { label: 'Долгая память', short: 'SUMMARY', variants: [
    { id: 'rolling', name: 'Выжимки диалогов', desc: 'Агент запоминает факты о пользователе и проекте.', fields: [{ k: 'every', label: 'Сжимать каждые N сообщений', t: 'number', req: true, def: '30' }] },
    { id: 'graph', name: 'Граф знаний (Neo4j)', desc: 'Сущности и связи в графовой БД.', fields: [url('Bolt URL', 'neo4j+s://…'), key('Пароль', '', 'password')] },
  ] },
  kb: { label: 'База знаний', short: 'KNOWLEDGE', variants: [
    { id: 'files', name: 'Файлы и документы', desc: 'PDF, DOCX, Markdown — нарезка и индексация.', fields: [{ k: 'source', label: 'Папка или ссылка', t: 'text', req: true, ph: 's3://bucket/docs или https://…' }, { k: 'chunk', label: 'Размер чанка', t: 'number', req: true, def: '800' }] },
    { id: 'git', name: 'Git-репозиторий', desc: 'Код проекта как контекст инженера.', fields: [url('URL репозитория', 'https://github.com/…', 'repo'), key('Токен доступа', 'ghp_…', 'token')] },
    { id: 'site', name: 'Сайт / документация', desc: 'Краулинг страниц документации.', fields: [url('Стартовый URL', 'https://docs…')] },
  ] },
  toolbus: { label: 'Шина инструментов', short: 'TOOL BUS', variants: [
    { id: 'functions', name: 'Function calling', desc: 'Раздаёт модели описания инструментов и исполняет вызовы.', fields: [{ k: 'parallel', label: 'Параллельные вызовы', t: 'select', req: true, def: 'да', opt: ['да', 'нет'] }, { k: 'timeout', label: 'Таймаут, сек', t: 'number', req: true, def: '30' }] },
  ] },
  http: { label: 'HTTP API', short: 'API', variants: [
    { id: 'rest', name: 'REST API', desc: 'Любой внешний API: адрес, метод и ключ.', fields: [{ k: 'name', label: 'Название инструмента', t: 'text', req: true, def: 'my_api' }, url('Endpoint', 'https://api.example.com/v1/…'), { k: 'method', label: 'Метод', t: 'select', req: true, def: 'GET', opt: ['GET', 'POST', 'PUT', 'DELETE'] }, { k: 'authHeader', label: 'Заголовок авторизации', t: 'text', req: false, def: 'Authorization: Bearer' }, key('API-ключ')] },
    { id: 'openapi', name: 'OpenAPI-спека', desc: 'Импорт всех методов из openapi.json.', fields: [url('URL спецификации', 'https://…/openapi.json', 'spec'), key('API-ключ')] },
    { id: 'graphql', name: 'GraphQL', desc: 'GraphQL endpoint.', fields: [url('Endpoint', 'https://…/graphql'), key('Токен', '', 'token')] },
  ] },
  search: { label: 'Веб-поиск', short: 'SEARCH', variants: [
    { id: 'tavily', name: 'Tavily', desc: 'Поиск для агентов.', keyUrl: 'https://app.tavily.com', fields: [key('API-ключ', 'tvly-…')] },
    { id: 'brave', name: 'Brave Search', desc: 'Brave Search API.', keyUrl: 'https://api-dashboard.search.brave.com/app/keys', fields: [key('API-ключ')] },
    { id: 'yandex-search', name: 'Yandex Search API', desc: 'Поиск Яндекса через AI Studio.', keyUrl: 'https://yandex.cloud/ru/docs/search-api/', fields: [key('API-ключ', 'AQVN…'), { k: 'folderId', label: 'ID каталога', t: 'text', req: true, ph: 'b1g…' }] },
    { id: 'serpapi', name: 'SerpAPI', desc: 'Выдача Google и др.', keyUrl: 'https://serpapi.com/manage-api-key', fields: [key('API-ключ')] },
  ] },
  sandbox: { label: 'Исполнение кода', short: 'SANDBOX', variants: [
    { id: 'e2b', name: 'E2B', desc: 'Облачная песочница для кода.', keyUrl: 'https://e2b.dev/dashboard', catalog: 'e2b-sandbox', fields: [key('API-ключ', 'e2b_…')] },
    { id: 'docker', name: 'Docker на сервере', desc: 'Изолированный контейнер на своём сервере.', fields: [{ k: 'image', label: 'Образ', t: 'text', req: true, def: 'python:3.12-slim' }, { k: 'limit', label: 'Лимит памяти', t: 'text', req: true, def: '512m' }] },
  ] },
  browser: { label: 'Браузер', short: 'BROWSER', variants: [
    { id: 'playwright', name: 'Playwright', desc: 'Headless-браузер на сервере.', fields: [{ k: 'headless', label: 'Без окна', t: 'select', req: true, def: 'да', opt: ['да', 'нет'] }] },
    { id: 'browserbase', name: 'Browserbase', desc: 'Облачные браузеры.', keyUrl: 'https://www.browserbase.com/settings', fields: [key('API-ключ'), { k: 'project', label: 'Project ID', t: 'text', req: true }] },
  ] },
  db: { label: 'База данных', short: 'DATABASE', variants: [
    { id: 'postgres', name: 'PostgreSQL', desc: 'SQL-запросы к рабочей базе.', fields: [key('DSN', 'postgres://user:pass@host:5432/db', 'dsn'), { k: 'mode', label: 'Доступ', t: 'select', req: true, def: 'только чтение', opt: ['только чтение', 'чтение и запись'] }] },
    { id: 'mysql', name: 'MySQL', desc: 'SQL-запросы к MySQL.', fields: [key('DSN', 'mysql://…', 'dsn')] },
    { id: 'clickhouse', name: 'ClickHouse', desc: 'Аналитика.', fields: [url('URL', 'https://…:8443'), key('Пароль', '', 'password')] },
  ] },
  mcp: { label: 'MCP-сервер', short: 'MCP', variants: [
    { id: 'remote', name: 'Удалённый MCP', desc: 'Подключение MCP-сервера по URL.', catalog: 'anthropic-mcp', fields: [url('URL сервера', 'https://…/mcp'), key('Токен', '', 'token')] },
    { id: 'github', name: 'GitHub MCP', desc: 'Issues, PR, код.', keyUrl: 'https://github.com/settings/tokens', catalog: 'anthropic-mcp', fields: [key('GitHub токен', 'ghp_…', 'token')] },
    { id: 'filesystem', name: 'Файловая система', desc: 'Чтение/запись файлов в разрешённой папке.', fields: [{ k: 'root', label: 'Корневая папка', t: 'text', req: true, def: '/srv/agent' }] },
  ] },
  storage: { label: 'Файловое хранилище', short: 'STORAGE', variants: [
    { id: 's3', name: 'S3-совместимое', desc: 'Yandex Object Storage, AWS S3, MinIO.', fields: [url('Endpoint', 'https://storage.yandexcloud.net', 'endpoint'), { k: 'bucket', label: 'Бакет', t: 'text', req: true }, key('Access key', '', 'accessKey'), key('Secret key', '', 'secretKey')] },
  ] },
  planner: { label: 'Планировщик', short: 'PLANNER', variants: [
    { id: 'react', name: 'ReAct', desc: 'Думай → действуй → наблюдай, по шагу.', fields: [{ k: 'maxSteps', label: 'Макс. шагов', t: 'number', req: true, def: '25' }] },
    { id: 'plan-exec', name: 'Plan & Execute', desc: 'Сначала полный план, потом исполнение.', fields: [{ k: 'maxSteps', label: 'Макс. шагов', t: 'number', req: true, def: '40' }, { k: 'replan', label: 'Перепланировать при ошибке', t: 'select', req: true, def: 'да', opt: ['да', 'нет'] }] },
    { id: 'tree', name: 'Tree of Thoughts', desc: 'Несколько веток решения, выбор лучшей.', fields: [{ k: 'branches', label: 'Веток', t: 'number', req: true, def: '3' }] },
  ] },
  router: { label: 'Маршрутизатор', short: 'ROUTER', variants: [
    { id: 'intent', name: 'По намерению', desc: 'Определяет тип задачи и выбирает исполнителя.', fields: [{ k: 'routes', label: 'Маршруты', t: 'textarea', req: true, def: 'код → инженер\nвопрос → ответчик\nданные → аналитик' }] },
    { id: 'cost', name: 'По стоимости', desc: 'Простое — дешёвой модели, сложное — сильной.', fields: [{ k: 'threshold', label: 'Порог сложности (0–1)', t: 'number', req: true, def: '0.6' }] },
  ] },
  executor: { label: 'Исполнитель', short: 'EXECUTOR', variants: [
    { id: 'sequential', name: 'Последовательный', desc: 'Шаги по очереди.', fields: [{ k: 'retries', label: 'Повторов при ошибке', t: 'number', req: true, def: '2' }] },
    { id: 'parallel', name: 'Параллельный', desc: 'Независимые шаги одновременно.', fields: [{ k: 'workers', label: 'Потоков', t: 'number', req: true, def: '4' }, { k: 'retries', label: 'Повторов при ошибке', t: 'number', req: true, def: '2' }] },
  ] },
  critic: { label: 'Самопроверка', short: 'CRITIC', variants: [
    { id: 'reflection', name: 'Рефлексия', desc: 'Агент проверяет свой результат перед ответом.', fields: [{ k: 'rounds', label: 'Раундов', t: 'number', req: true, def: '1' }] },
    { id: 'tests', name: 'Прогон тестов', desc: 'Результат считается готовым, только если тесты зелёные.', fields: [{ k: 'cmd', label: 'Команда тестов', t: 'text', req: true, def: 'npm test' }] },
  ] },
  queue: { label: 'Очередь задач', short: 'QUEUE', variants: [
    { id: 'memory', name: 'В памяти', desc: 'Простая очередь в процессе.', fields: [{ k: 'concurrency', label: 'Одновременно задач', t: 'number', req: true, def: '2' }] },
    { id: 'redis', name: 'Redis / BullMQ', desc: 'Надёжная очередь с повторами.', fields: [url('Redis URL', 'redis://…')] },
  ] },
  subagent: { label: 'Под-агент', short: 'SUB-AGENT', variants: [
    { id: 'coder', name: 'Кодер', desc: 'Пишет и правит код.', fields: [{ k: 'goal', label: 'Задача под-агента', t: 'text', req: true, def: 'Писать и исправлять код по плану' }] },
    { id: 'reviewer', name: 'Ревьюер', desc: 'Проверяет диффы и ищет ошибки.', fields: [{ k: 'goal', label: 'Задача под-агента', t: 'text', req: true, def: 'Ревью изменений перед отправкой' }] },
    { id: 'researcher', name: 'Исследователь', desc: 'Ищет информацию и документацию.', fields: [{ k: 'goal', label: 'Задача под-агента', t: 'text', req: true, def: 'Искать документацию и примеры' }] },
  ] },
  gateway: { label: 'Шлюз API', short: 'GATEWAY', variants: [
    { id: 'api', name: 'REST-шлюз агента', desc: 'Единая точка входа: все каналы приходят сюда.', partners: ['reg-ru'], partnerText: 'Для вебхуков нужен сервер с публичным адресом:', fields: [{ k: 'path', label: 'Путь', t: 'text', req: true, def: '/api/agent' }, key('Ключ доступа к агенту', 'придумайте секрет', 'accessKey')] },
  ] },
  telegram: { label: 'Telegram-бот', short: 'TELEGRAM', variants: [
    { id: 'bot', name: 'Telegram Bot API', desc: 'Токен от @BotFather.', keyUrl: 'https://t.me/BotFather', partners: ['reg-ru'], partnerText: 'Для вебхуков нужен сервер с публичным адресом:', fields: [key('Токен бота', '123456:ABC…', 'token'), { k: 'allowed', label: 'Разрешённые user id', t: 'text', req: false, ph: 'пусто = все' }] },
  ] },
  webchat: { label: 'Веб-чат', short: 'WEB CHAT', variants: [
    { id: 'widget', name: 'Виджет на сайт', desc: 'Окно чата для вашего сайта.', fields: [{ k: 'domain', label: 'Домен сайта', t: 'text', req: true, ph: 'example.ru' }, { k: 'greeting', label: 'Приветствие', t: 'text', req: false, def: 'Здравствуйте! Чем помочь?' }] },
  ] },
  email: { label: 'Почта', short: 'EMAIL', variants: [
    { id: 'resend', name: 'Resend', desc: 'Отправка писем через Resend.', keyUrl: 'https://resend.com/api-keys', fields: [key('API-ключ', 're_…'), { k: 'from', label: 'Отправитель', t: 'text', req: true, ph: 'agent@домен' }] },
    { id: 'smtp', name: 'SMTP', desc: 'Любой почтовый сервер.', fields: [{ k: 'host', label: 'SMTP-хост', t: 'text', req: true, ph: 'smtp.yandex.ru' }, { k: 'user', label: 'Логин', t: 'text', req: true }, key('Пароль', '', 'password')] },
  ] },
  webhook: { label: 'Вебхуки', short: 'WEBHOOK', variants: [
    { id: 'in', name: 'Входящий вебхук', desc: 'Внешние сервисы запускают агента событием.', partners: ['reg-ru'], partnerText: 'Для вебхуков нужен сервер с публичным адресом:', fields: [{ k: 'path', label: 'Путь', t: 'text', req: true, def: '/hooks/agent' }, key('Секрет подписи', '', 'secret')] },
    { id: 'out', name: 'Исходящий вебхук', desc: 'Агент отправляет результат на ваш URL.', fields: [url('URL получателя', 'https://…')] },
  ] },
  messenger: { label: 'Мессенджер', short: 'MESSENGER', variants: [
    { id: 'vk', name: 'VK', desc: 'Сообщения сообщества VK.', keyUrl: 'https://dev.vk.com/ru/api/bots/getting-started', fields: [key('Токен сообщества', '', 'token')] },
    { id: 'slack', name: 'Slack', desc: 'Slack-бот.', keyUrl: 'https://api.slack.com/apps', fields: [key('Bot token', 'xoxb-…', 'token')] },
    { id: 'max', name: 'MAX', desc: 'Бот в мессенджере MAX.', fields: [key('Токен бота', '', 'token')] },
  ] },
  guardrails: { label: 'Политики безопасности', short: 'GUARD', variants: [
    { id: 'policy', name: 'Фильтры и запреты', desc: 'Запрещённые темы, PII-маскирование, проверка команд.', fields: [{ k: 'deny', label: 'Запрещено', t: 'textarea', req: true, def: 'rm -rf\nDROP DATABASE\nпередача ключей' }, { k: 'pii', label: 'Маскировать персональные данные', t: 'select', req: true, def: 'да', opt: ['да', 'нет'] }] },
  ] },
  budget: { label: 'Бюджет', short: 'BUDGET', variants: [
    { id: 'limits', name: 'Лимиты расходов', desc: 'Остановка агента при превышении бюджета.', fields: [{ k: 'perTask', label: '$ на задачу', t: 'number', req: true, def: '1' }, { k: 'perDay', label: '$ в день', t: 'number', req: true, def: '20' }] },
  ] },
  tracing: { label: 'Трассировка', short: 'TRACING', variants: [
    { id: 'langfuse', name: 'Langfuse', desc: 'Трейсы, стоимость, промпты.', keyUrl: 'https://cloud.langfuse.com', fields: [url('Host', 'https://cloud.langfuse.com', 'host'), key('Public key', 'pk-lf-…', 'publicKey'), key('Secret key', 'sk-lf-…', 'secretKey')] },
    { id: 'langsmith', name: 'LangSmith', desc: 'Трейсы LangChain.', keyUrl: 'https://smith.langchain.com/settings', catalog: 'langsmith-langchain', fields: [key('API-ключ', 'lsv2_…')] },
    { id: 'logs', name: 'Логи в файл', desc: 'JSON-логи на сервере.', fields: [{ k: 'path', label: 'Путь', t: 'text', req: true, def: '/var/log/agent' }] },
  ] },
  evals: { label: 'Оценка качества', short: 'EVALS', variants: [
    { id: 'basic', name: 'Набор проверок', desc: 'Эталонные задачи прогоняются после изменений.', fields: [{ k: 'cases', label: 'Кейсов', t: 'number', req: true, def: '20' }, { k: 'pass', label: 'Порог прохождения, %', t: 'number', req: true, def: '85' }] },
  ] },
  approval: { label: 'Подтверждение человеком', short: 'HUMAN', variants: [
    { id: 'manual', name: 'Ручное одобрение', desc: 'Опасные действия ждут вашего «да».', fields: [{ k: 'actions', label: 'Что подтверждать', t: 'textarea', req: true, def: 'деплой\nоплата\nудаление данных' }, { k: 'channel', label: 'Куда слать запрос', t: 'select', req: true, def: 'Telegram', opt: ['Telegram', 'Почта', 'Веб-чат'] }] },
  ] },
  ratelimit: { label: 'Лимит запросов', short: 'RATE', variants: [
    { id: 'simple', name: 'Ограничение частоты', desc: 'Защита от спама и перерасхода.', fields: [{ k: 'rpm', label: 'Запросов в минуту', t: 'number', req: true, def: '30' }] },
  ] },
};

// p(id, kind, variant, x, z, w, d, h) — деталь на плате; s(...) — пустой слот.
const p = (id, kind, variant, x, z, w = 2.6, d = 2, h = 1) => ({ id, kind, variant, x, z, w, d, h });
const s = (id, kind, label, x, z, w = 2.6, d = 2, h = 1) => ({ id, kind, label, x, z, w, d, h });

export const BOARDS = [
  { id: 'channels', key: '1', title: 'Каналы', en: 'CHANNELS', desc: 'Откуда приходят задачи и куда уходят ответы: Telegram, веб-чат, почта, вебхуки. Всё сходится в шлюз API.',
    size: [17, 11], hub: 'gateway',
    parts: [p('gateway', 'gateway', 'api', 0, 0.2, 4, 3, 2.1), p('telegram', 'telegram', 'bot', -5.6, -2.6), p('webchat', 'webchat', 'widget', -5.6, 0.6), p('email', 'email', 'resend', 5.6, -2.6), p('webhook', 'webhook', 'in', 5.6, 0.6)],
    slots: [s('messenger', 'messenger', 'Мессенджер', -5.6, 3.6), s('webhook2', 'webhook', 'Ещё вебхук', 5.6, 3.6)],
    links: [['telegram', 'gateway'], ['webchat', 'gateway'], ['email', 'gateway'], ['webhook', 'gateway']] },
  { id: 'control', key: '2', title: 'Контроль', en: 'CONTROL', desc: 'Безопасность и наблюдаемость: фильтры, бюджет, трейсы, оценка качества и подтверждение опасных действий человеком.',
    size: [17, 11], hub: 'guard',
    parts: [p('guard', 'guardrails', 'policy', 0, 0, 4, 3, 1.8), p('budget', 'budget', 'limits', -5.6, -2.6), p('approval', 'approval', 'manual', -5.6, 0.8, 2.6, 2, 1.3), p('tracing', 'tracing', 'langfuse', 5.6, -2.6, 2.6, 2, 1.5), p('evals', 'evals', 'basic', 5.6, 0.8)],
    slots: [s('rate', 'ratelimit', 'Лимит запросов', 0, 3.9, 3, 1.6, 0.7)],
    links: [['budget', 'guard'], ['approval', 'guard'], ['guard', 'tracing'], ['tracing', 'evals']] },
  { id: 'orchestrator', key: '3', title: 'Оркестратор', en: 'ORCHESTRATOR', desc: 'Мозг процесса: маршрутизатор понимает задачу, планировщик раскладывает её на шаги, исполнитель запускает, критик проверяет.',
    size: [18, 11], hub: 'planner',
    parts: [p('router', 'router', 'intent', -6, -2.4, 2.6, 2, 1.2), p('planner', 'planner', 'plan-exec', -1.4, -1.4, 3.6, 3, 2.2), p('executor', 'executor', 'parallel', 3.4, -1.4, 3, 2.4, 1.6), p('critic', 'critic', 'tests', 7, -2.4, 2.4, 2, 1.1), p('queue', 'queue', 'memory', -6, 1.4, 2.6, 2, 0.8)],
    slots: [s('sub1', 'subagent', 'Под-агент', -0.6, 3.2, 2.6, 2, 1), s('sub2', 'subagent', 'Под-агент', 3, 3.2, 2.6, 2, 1), s('sub3', 'subagent', 'Под-агент', 6.6, 2.2, 2.6, 2, 1)],
    links: [['router', 'planner'], ['queue', 'router'], ['planner', 'executor'], ['executor', 'critic']] },
  { id: 'core', key: '4', title: 'Ядро LLM', en: 'LLM CORE', desc: 'Языковая модель и всё, что определяет её поведение: провайдер и ключ, системный промпт, параметры, контекст и кэш.',
    size: [17, 11], hub: 'llm',
    parts: [p('llm', 'llm', 'openai', 0, -0.4, 4, 3.4, 2.6), p('prompt', 'prompt', 'system', -5.6, -2.6, 2.8, 2, 0.9), p('params', 'params', 'sampling', -5.6, 0.8, 2.6, 2, 0.7), p('context', 'context', 'window', 5.6, -2.6, 2.6, 2, 1), p('cache', 'cache', 'semantic', 5.6, 0.8, 2.6, 2, 0.8)],
    slots: [s('fallback', 'llm', 'Резервная модель', 0, 3.6, 3.4, 1.8, 1.2)],
    links: [['prompt', 'llm'], ['params', 'llm'], ['context', 'llm'], ['cache', 'llm']] },
  { id: 'memory', key: '5', title: 'Память', en: 'MEMORY', desc: 'Что агент помнит: буфер диалога, долгая память, векторная база с эмбеддингами и база знаний (документы, код).',
    size: [17, 11], hub: 'vector',
    parts: [p('vector', 'vectordb', 'qdrant', 1.2, -0.6, 4, 3.2, 2.2), p('embed', 'embeddings', 'openai-emb', -4.4, -2.4, 2.6, 2, 1.1), p('buffer', 'buffer', 'window', -4.4, 1, 2.6, 2, 0.8), p('summary', 'summary', 'rolling', 6.4, -2.4, 2.4, 2, 1), p('kb', 'kb', 'git', 6.4, 1, 2.4, 2, 1.4)],
    slots: [s('kb2', 'kb', 'Ещё источник', 1.2, 3.6, 3, 1.6, 0.9)],
    links: [['embed', 'vector'], ['kb', 'embed'], ['buffer', 'summary'], ['summary', 'vector']] },
  { id: 'tools', key: '6', title: 'Инструменты', en: 'TOOLS', desc: 'Руки агента: внешние API, поиск, исполнение кода, браузер, базы данных и MCP-серверы. Каждый инструмент — отдельная деталь.',
    size: [19, 11], hub: 'bus',
    parts: [p('bus', 'toolbus', 'functions', 0, -0.2, 3.6, 2.6, 1.6), p('http', 'http', 'rest', -6.6, -2.6), p('search', 'search', 'tavily', -6.6, 0.8), p('sandbox', 'sandbox', 'docker', 6.6, -2.6, 2.6, 2, 1.4), p('browser', 'browser', 'playwright', 6.6, 0.8), p('db', 'db', 'postgres', -2.6, 3.5, 2.6, 1.8, 0.9), p('mcp', 'mcp', 'github', 2.6, 3.5, 2.6, 1.8, 0.9)],
    slots: [s('api2', 'http', 'Ещё API', -3, -3.6, 2.4, 1.6, 0.9), s('mcp2', 'mcp', 'MCP-сервер', 3, -3.6, 2.4, 1.6, 0.9)],
    links: [['http', 'bus'], ['search', 'bus'], ['sandbox', 'bus'], ['browser', 'bus'], ['db', 'bus'], ['mcp', 'bus']] },
];

// Обзорная «материнская» плата: модули-платы и потоки между ними.
export const SYSTEM = {
  size: [24, 15],
  layout: { channels: [-8, -3.6], control: [0, -3.6], orchestrator: [8, -3.6], core: [-8, 3.8], memory: [0, 3.8], tools: [8, 3.8] },
  links: [['channels', 'control'], ['control', 'orchestrator'], ['orchestrator', 'core'], ['orchestrator', 'tools'], ['core', 'memory'], ['tools', 'memory']],
  demo: [
    ['channels', 'Пользователь пишет в Telegram: «Почини падающий тест в репозитории». Шлюз принимает задачу.'],
    ['control', 'Контроль: фильтры пропускают запрос, бюджет в норме, трейс открыт.'],
    ['orchestrator', 'Оркестратор: маршрутизатор относит задачу к «код», планировщик строит план из 5 шагов.'],
    ['core', 'Ядро LLM: модель получает промпт роли, контекст и план, решает, какой инструмент вызвать.'],
    ['memory', 'Память: из векторной базы подтягиваются нужные файлы репозитория и прошлые решения.'],
    ['tools', 'Инструменты: песочница запускает тесты, GitHub MCP открывает PR с исправлением.'],
    ['orchestrator', 'Критик прогоняет тесты ещё раз — зелёные. Задача закрыта.'],
    ['channels', 'Ответ с ссылкой на PR уходит обратно в Telegram.'],
  ],
};

// Партнёрские сервисы: id → название и реферальная ссылка.
export const PARTNERS = {
  polza: { name: 'Polza.ai', url: 'https://polza.ai/?referral=NWp3KtVDvw' },
  bothub: { name: 'BotHub', url: 'https://bothub.ru/?invitedBy=J0xaBCyOs5I6tpG1UVvCS' },
  gptunnel: { name: 'GPTunnel', url: 'https://gptunnel.ru/?ref=6a1075f08d4e550001d22ce8' },
  'reg-ru': { name: 'REG.RU VPS', url: 'https://www.reg.ru/?rlink=reflink-31809933' },
};

// Готовые шаблоны агентских систем: keep — какие детали оставить, variants — смена варианта,
// fill — заполнить пустой слот деталью, links — дополнительные связи.
export const TEMPLATES = [
  { id: 'full', name: 'Полная система', desc: 'Все платы и детали — максимальная конфигурация.', boards: {} },
  { id: 'support-bot', name: 'Бот поддержки в Telegram', desc: 'Отвечает клиентам в Telegram и на сайте по базе знаний, сложные вопросы передаёт человеку.',
    boards: {
      channels: { keep: ['gateway', 'telegram', 'webchat'] },
      control: { keep: ['guard', 'budget', 'approval', 'tracing'] },
      orchestrator: { keep: ['router', 'executor', 'queue'], variants: { executor: 'sequential' } },
      memory: { keep: ['vector', 'embed', 'buffer', 'kb'], variants: { kb: 'files' } },
      tools: { keep: ['bus', 'http'] },
    } },
  { id: 'rag', name: 'RAG по документам', desc: 'Чат-виджет на сайте отвечает по вашим файлам и базе знаний со ссылками на источники.',
    boards: {
      channels: { keep: ['gateway', 'webchat'] },
      control: { keep: ['guard', 'budget', 'tracing', 'evals'] },
      orchestrator: { keep: ['router', 'executor'], variants: { executor: 'sequential' } },
      core: { keep: ['llm', 'prompt', 'params', 'context'] },
      memory: { keep: ['vector', 'embed', 'buffer', 'kb'], variants: { vector: 'pgvector', kb: 'files' } },
      tools: { keep: ['bus', 'db'] },
    } },
  { id: 'researcher', name: 'Исследователь с веб-поиском', desc: 'Получает задачу в Telegram, ищет в интернете, читает страницы и присылает отчёт.',
    boards: {
      channels: { keep: ['gateway', 'telegram'] },
      control: { keep: ['budget', 'tracing'] },
      orchestrator: { keep: ['planner', 'executor', 'critic', 'queue'], variants: { critic: 'reflection' }, fill: { sub1: 'researcher' }, links: [['executor', 'sub1']] },
      memory: { keep: ['vector', 'embed', 'buffer', 'summary'] },
      tools: { keep: ['bus', 'search', 'browser', 'http'] },
    } },
  { id: 'coder', name: 'AI-разработчик', desc: 'Берёт задачи из GitHub, пишет код в песочнице, прогоняет тесты и отдаёт на ревью.',
    boards: {
      channels: { keep: ['gateway', 'webhook'] },
      control: { keep: ['guard', 'budget', 'approval', 'tracing'] },
      orchestrator: { keep: ['planner', 'executor', 'critic', 'queue'], variants: { planner: 'tree', critic: 'tests' }, fill: { sub1: 'coder', sub2: 'reviewer' }, links: [['executor', 'sub1'], ['executor', 'sub2']] },
      core: { variants: { llm: 'anthropic' } },
      memory: { keep: ['vector', 'embed', 'buffer', 'kb'] },
      tools: { keep: ['bus', 'sandbox', 'mcp'], variants: { sandbox: 'e2b' } },
    } },
];
