/*! Qantcore AI Engineer — первоисточник: https://qantcore.space/ai-engineer/
 *  (c) 2026 Qantcore. Если этот файл открыт на другом домене — перед вами копия.
 *  Оригинал, история и лицензия: см. ссылку выше. */
// Прикидка стоимости агента в ₽/мес. Чистый модуль — тестируется в node.
import { PRICES, PRICE_SRC, priceOf, PRICES_CHECKED, FX_DEFAULT } from './prices.js';
export { PRICES, PRICE_SRC, priceOf, PRICES_CHECKED, FX_DEFAULT };

export const COST_DEFAULTS = { dialogs: 1000, msgs: 6, inTok: 1500, outTok: 400, fx: FX_DEFAULT };

// Шагов LLM на сообщение: 1 вызов + ещё 1, если на плате инструментов есть детали.
export function hasTools(state) {
  return (state.boards?.tools?.parts?.length || 0) > 0;
}
export function llmCalls(state, a) {
  return a.dialogs * a.msgs * (hasTools(state) ? 2 : 1);
}

// p = priceOf(variant, model) → ₽/мес, null если цены нет.
export function costRub(p, a, calls) {
  if (!p) return null;
  const v = calls * (a.inTok * p.in + a.outTok * p.out) / 1e6;
  return p.cur === 'RUB' ? v : v * a.fx;
}

export function estimate(state, a) {
  const calls = llmCalls(state, a);
  const part = state.boards?.core?.parts.find((p) => p.kind === 'llm');
  const options = [];
  for (const [variant, models] of Object.entries(PRICES))
    for (const [model, price] of Object.entries(models))
      if (model !== '*') options.push({ variant, model, rub: costRub(price, a, calls), price });
  options.sort((x, y) => (x.rub ?? Infinity) - (y.rub ?? Infinity));
  const current = part ? { variant: part.variant, model: part.values?.model || '', price: priceOf(part.variant, part.values?.model || '') } : null;
  if (current) current.rub = costRub(current.price, a, calls);
  return { calls, current, options };
}
