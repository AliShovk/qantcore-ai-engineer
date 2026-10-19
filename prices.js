/*! Qantcore AI Engineer — первоисточник: https://qantcore.space/ai-engineer/
 *  (c) 2026 Qantcore. Если этот файл открыт на другом домене — перед вами копия.
 *  Оригинал, история и лицензия: см. ссылку выше. */
// Тарифы LLM за 1 млн токенов (in — вход, out — выход). Проверено по официальным страницам 2026-10-16.
// null — цену не удалось подтвердить: пользователь видит ссылку на тариф провайдера.
export const PRICES_CHECKED = '2026-10-16';
export const FX_DEFAULT = 83.76; // ₽ за $1, ЦБ РФ на 2026-10-16; на странице обновляется из cbr-xml-daily.ru

const OPENAI = 'https://platform.openai.com/docs/pricing';
const ANTHROPIC = 'https://docs.anthropic.com/en/docs/about-claude/pricing';
const GEMINI = 'https://ai.google.dev/gemini-api/docs/pricing';
const DEEPSEEK = 'https://api-docs.deepseek.com/quick_start/pricing';
const QWEN = 'https://www.alibabacloud.com/help/en/model-studio/model-pricing';
const GIGA = 'https://developers.sber.ru/docs/ru/gigachat/tariffs/legal-tariffs';
const YANDEX = 'https://aistudio.yandex.ru/docs/ru/ai-studio/pricing';

export const PRICE_SRC = { openai: OPENAI, anthropic: ANTHROPIC, gemini: GEMINI, deepseek: DEEPSEEK, qwen: QWEN, gigachat: GIGA, yandexgpt: YANDEX, openrouter: 'https://openrouter.ai/models', ollama: 'https://ollama.com/download' };

// variant → model → { in, out, cur, note? }
export const PRICES = {
  openai: {
    'gpt-6.1-sol': { in: 2, out: 10, cur: 'USD' },
    'gpt-6-astra': { in: 10, out: 50, cur: 'USD' },
    'gpt-6-luna': { in: 0.1, out: 0.5, cur: 'USD' },
  },
  anthropic: {
    'claude-sonnet-4-5': { in: 3, out: 15, cur: 'USD' },
    'claude-opus-4-1': { in: 15, out: 75, cur: 'USD' },
    'claude-haiku-4-5': { in: 1, out: 5, cur: 'USD' },
  },
  gemini: {
    'gemini-3.8-flash': { in: 0.75, out: 3.75, cur: 'USD', note: 'до 31.12.2026, с 01.01.2027 — $1.50 / $7.50' },
    'gemini-3.1-pro-preview': { in: 2, out: 12, cur: 'USD', note: 'промпты до 200k токенов' },
    'gemini-4-argon': { in: 2, out: 10, cur: 'USD', note: 'до 30.11.2026, с 01.12.2026 — $4 / $20' },
    'gemini-3.5-flash-lite': { in: 0.3, out: 2.5, cur: 'USD' },
  },
  deepseek: {
    'deepseek-flash': { in: 0.3, out: 1.2, cur: 'USD', note: 'пиковый тариф; в непиковые часы вдвое дешевле' },
    'deepseek-v4-pro': { in: 1.32, out: 3.96, cur: 'USD', note: 'пиковый тариф; в непиковые часы вдвое дешевле' },
  },
  qwen: {
    'qwen-max': { in: 1.6, out: 6.4, cur: 'USD' },
    'qwen-plus': { in: 0.4, out: 1.2, cur: 'USD', note: 'без thinking, контекст до 256K' },
    'qwen-flash': { in: 0.05, out: 0.4, cur: 'USD', note: 'контекст до 256K' },
  },
  gigachat: {
    'GigaChat-2': { in: 65, out: 65, cur: 'RUB', note: 'по пакету 300 млн токенов за 19 500 ₽ с НДС' },
    'GigaChat-2-Pro': { in: 500, out: 500, cur: 'RUB', note: 'по пакету 50 млн токенов за 25 000 ₽ с НДС' },
    'GigaChat-2-Max': { in: 650, out: 650, cur: 'RUB', note: 'по пакету 30 млн токенов за 19 500 ₽ с НДС' },
  },
  ollama: { '*': { in: 0, out: 0, cur: 'USD', note: 'токены бесплатны — платите только за сервер' } },
};

export function priceOf(variant, model) {
  const t = PRICES[variant];
  if (!t) return null;
  return t[model] || t['*'] || null;
}
