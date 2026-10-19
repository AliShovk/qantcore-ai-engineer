/*! Qantcore AI Engineer — первоисточник: https://qantcore.space/ai-engineer/
 *  (c) 2026 Qantcore. Если этот файл открыт на другом домене — перед вами копия.
 *  Оригинал, история и лицензия: см. ссылку выше. */
// Модель состояния: значения по умолчанию, стартовая схема, применение шаблонов.
import { KINDS, BOARDS } from './boards.js?v=4';

export function defaults(kind, variant) {
  const v = KINDS[kind].variants.find((x) => x.id === variant) || KINDS[kind].variants[0];
  const o = {};
  for (const f of v.fields) if (f.def != null) o[f.k] = f.def;
  return o;
}

export function initState() {
  const boards = {};
  for (const b of BOARDS) {
    boards[b.id] = {
      parts: b.parts.map((p) => ({ ...p, uid: p.id, values: defaults(p.kind, p.variant) })),
      slots: b.slots.map((s) => ({ ...s, uid: s.id })),
      links: b.links.map((l) => l.slice()),
    };
  }
  return { name: 'AI Инженер', boards, seq: 1 };
}

// Новая схема из свежей `base` по спецификации шаблона `tpl`; `prev` — прежнее
// состояние: у деталей с тем же uid, kind и variant сохраняются введённые значения.
export function applyTemplate(base, tpl, prev) {
  const boards = {};
  for (const b of BOARDS) {
    const spec = tpl.boards?.[b.id] || {};
    const bs = base.boards[b.id];
    const keep = spec.keep ? new Set(spec.keep) : null;
    const parts = [], slots = [...bs.slots];
    for (const part of bs.parts) {
      if (keep && !keep.has(part.uid)) {
        slots.push({ uid: part.uid + '_slot', kind: part.kind, label: KINDS[part.kind].label, x: part.x, z: part.z, w: part.w, d: part.d, h: part.h });
        continue;
      }
      const np = { ...part, values: { ...part.values } };
      if (spec.variants?.[np.uid]) { np.variant = spec.variants[np.uid]; np.values = defaults(np.kind, np.variant); }
      parts.push(np);
    }
    for (const [slotId, variant] of Object.entries(spec.fill || {})) {
      const i = slots.findIndex((s) => s.uid === slotId);
      if (i < 0) continue;
      const slot = slots[i];
      slots.splice(i, 1);
      parts.push({ uid: slotId, id: slotId, kind: slot.kind, variant, x: slot.x, z: slot.z, w: slot.w, d: slot.d, h: slot.h, values: defaults(slot.kind, variant) });
    }
    const kept = new Set(parts.map((p) => p.uid));
    const links = bs.links.filter(([a, c]) => kept.has(a) && kept.has(c));
    for (const [a, c] of spec.links || []) if (kept.has(a) && kept.has(c)) links.push([a, c]);
    const prevParts = prev?.boards?.[b.id]?.parts || [];
    for (const np of parts) {
      const pp = prevParts.find((p) => p.uid === np.uid && p.kind === np.kind && p.variant === np.variant);
      if (pp) np.values = { ...np.values, ...pp.values };
    }
    // tpl.values?.[board]?.[uid] переопределяет отдельные ключи поверх carry-over
    for (const np of parts) {
      const tv = tpl.values?.[b.id]?.[np.uid];
      if (tv) np.values = { ...np.values, ...tv };
    }
    boards[b.id] = { parts, slots, links };
  }
  return { name: tpl.name, template: tpl.id, boards, seq: Math.max(base.seq, prev?.seq || 1), cost: prev?.cost };
}
