/*! Qantcore AI Engineer — первоисточник: https://qantcore.space/ai-engineer/
 *  (c) 2026 Qantcore. Если этот файл открыт на другом домене — перед вами копия.
 *  Оригинал, история и лицензия: см. ссылку выше. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { KINDS, BOARDS, SYSTEM, PARTNERS, TEMPLATES } from './boards.js?v=5';
import { defaults, initState, applyTemplate } from './model.js';
import { COST_DEFAULTS, hasTools, llmCalls, costRub, estimate, priceOf, PRICE_SRC, PRICES_CHECKED, FX_DEFAULT } from './cost.js?v=2';
import { buildProject, zipStore } from './exporter.js?v=3';
import { prepare, runTurn } from './runner.js?v=2';
import { ruleIntent, normalizeIntent, intentToTemplate, parseJSONLoose, COMPOSE_PROMPT } from './compose.js?v=2';

console.info('%cQantcore AI Engineer%c — оригинал: https://qantcore.space/ai-engineer/ · (c) 2026 Qantcore',
  'font-weight:700;color:#4ade80', 'color:#888');
const STORE = 'qc-ai-engineer-v1';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const boardDef = (id) => BOARDS.find((b) => b.id === id);
const variantOf = (part) => KINDS[part.kind].variants.find((v) => v.id === part.variant) || KINDS[part.kind].variants[0];

// ---------- state ----------
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && s.boards && BOARDS.every((b) => s.boards[b.id])) return s;
  } catch (e) { /* ignore */ }
  return null;
}
const saved = load();
let state = saved || initState();
const firstVisit = !saved;
state.cost = { ...COST_DEFAULTS, ...(state.cost || {}) };
let fxLive = null;
const costA = () => ({ ...COST_DEFAULTS, ...state.cost, fx: state.cost.fxManual ? state.cost.fx : (fxLive || COST_DEFAULTS.fx) });
// курс $ с сайта ЦБ — только в память; при недоступности тихо FX_DEFAULT
fetch('https://www.cbr-xml-daily.ru/daily_json.js').then((r) => r.json()).then((d) => { const v = d?.Valute?.USD?.Value; if (v) { fxLive = v; renderUI(); } }).catch(() => {});
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* quota */ } };

function partStatus(part) {
  const v = variantOf(part);
  const missing = v.fields.filter((f) => f.req && !String(part.values[f.k] ?? '').trim());
  const invalid = v.fields.filter((f) => f.t === 'url' && String(part.values[f.k] ?? '').trim() && !/^https?:\/\/[^\s]+$/i.test(String(part.values[f.k]).trim()));
  const secrets = v.fields.filter((f) => f.t === 'secret');
  return { missing, invalid, secrets, secretsSet: secrets.filter((f) => String(part.values[f.k] ?? '').trim()).length, ok: missing.length === 0 && invalid.length === 0 };
}
function boardStatus(id) {
  const parts = state.boards[id].parts;
  const st = parts.map(partStatus);
  return { total: parts.length, ready: st.filter((s) => s.ok).length, secrets: st.reduce((a, s) => a + s.secrets.length, 0), secretsSet: st.reduce((a, s) => a + s.secretsSet, 0), empty: state.boards[id].slots.length };
}

// ---------- theme ----------
const THEMES = {
  light: { bg: 0xe6e7e8, board: 0xf0f1f1, part: 0xf8f8f8, side: 0xf2f2f2, edge: 0x575b60, wire: 0x6b7076, text: '#33373c', muted: '#8b9097', partHex: '#f8f8f8', ok: '#2f9e6a' },
  dark: { bg: 0x121314, board: 0x1c1e20, part: 0x272a2d, side: 0x24272a, edge: 0x9aa0a6, wire: 0x7d838a, text: '#dfe3e7', muted: '#8d939a', partHex: '#272a2d', ok: '#4fd18f' },
};
const ACCENTS = ['#ff9a3c', '#22c3e6', '#5cc95c', '#a07cf0', '#f0506e'];
let themeName = localStorage.getItem(STORE + ':theme') || 'light';
let accent = localStorage.getItem(STORE + ':accent') || ACCENTS[0];
let T = THEMES[themeName];

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
$('#stage').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9da1, 2.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(-6, 12, 9);
scene.add(sun);
const ISO = new THREE.Vector3(-1, 1.12, 1).normalize();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
let halfH = 8;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.maxPolarAngle = Math.PI * 0.46;
controls.minZoom = 0.5;
controls.maxZoom = 4;
controls.autoRotateSpeed = 0.6;

function fitCamera(w, d) {
  const aspect = innerWidth / innerHeight, wide = innerWidth > 820;
  const availW = innerWidth - (wide ? 210 : 0), availH = innerHeight - (wide ? 150 : 170);
  camera.zoom = 1;
  controls.target.set(0, 0.6, 0);
  camera.position.copy(controls.target).addScaledVector(ISO, 80);
  camera.lookAt(controls.target);
  camera.updateMatrixWorld();
  let mx = 0, my = 0;
  const v = new THREE.Vector3();
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) for (const y of [-0.4, 2.2]) {
    v.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    mx = Math.max(mx, Math.abs(v.x)); my = Math.max(my, Math.abs(v.y - 0));
  }
  // halfH such that the board fits in the area not covered by panels
  halfH = Math.max(my * innerHeight / availH, (mx / aspect) * innerWidth / availW) * 1.04;
  setFrustum();
}
function setFrustum() {
  const aspect = innerWidth / innerHeight;
  const sideShift = innerWidth > 820 ? 105 : 0, upShift = innerWidth > 820 ? 40 : 60;
  camera.left = -halfH * aspect; camera.right = halfH * aspect; camera.top = halfH; camera.bottom = -halfH;
  camera.clearViewOffset();
  camera.setViewOffset(innerWidth, innerHeight, sideShift, upShift, innerWidth, innerHeight);
  camera.updateProjectionMatrix();
}
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  const b = view === 'system' ? SYSTEM.size : boardDef(view).size;
  fitCamera(b[0], b[1]);
});

// ---------- canvas textures ----------
const MONO = "'JetBrains Mono','SFMono-Regular',Consolas,'Liberation Mono',monospace";
function canvasTex(wu, du, ppu, draw) {
  const W = Math.min(1024, Math.round(wu * ppu)), H = Math.min(1024, Math.round(du * ppu));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  draw(ctx, W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
function spaced(ctx, text, x, y, sp) {
  let cx = x;
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + sp; }
}
function fitText(ctx, text, maxW, size, weight = '600') {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${MONO}`; s -= 1; } while (ctx.measureText(text).width > maxW && s > 9);
}
function drawPartTop(part, hot, mini) {
  return (ctx, W, H) => {
    const st = partStatus(part), k = KINDS[part.kind], v = variantOf(part);
    ctx.fillStyle = hot ? accent : T.partHex;
    ctx.fillRect(0, 0, W, H);
    const pad = Math.max(8, W * 0.06);
    ctx.strokeStyle = hot ? 'rgba(0,0,0,.25)' : T.muted;
    ctx.globalAlpha = 0.55; ctx.lineWidth = 2;
    ctx.strokeRect(pad * 0.5, pad * 0.5, W - pad, H - pad);
    ctx.globalAlpha = 1;
    const ink = hot ? '#1d1f22' : T.text;
    // LED
    const led = st.ok ? T.ok : accent;
    ctx.beginPath(); ctx.arc(W - pad * 1.4, pad * 1.4, Math.max(5, W * 0.025), 0, Math.PI * 2);
    ctx.fillStyle = hot ? '#1d1f22' : led; ctx.fill();
    if (mini) return;
    ctx.fillStyle = ink; ctx.textBaseline = 'top';
    fitText(ctx, k.short, W - pad * 4, Math.round(Math.min(H * 0.17, 40)), '700');
    spaced(ctx, k.short, pad * 1.3, pad * 1.2, 3);
    ctx.fillStyle = hot ? '#2b2d31' : T.muted;
    fitText(ctx, v.name, W - pad * 2.6, Math.round(Math.min(H * 0.13, 30)), '500');
    ctx.fillText(v.name, pad * 1.3, pad * 1.2 + H * 0.22);
    // status
    ctx.font = `600 ${Math.round(Math.min(H * 0.105, 24))}px ${MONO}`;
    let msg;
    if (st.ok) msg = st.secrets.length ? '● ключ задан · готово' : '● готово';
    else msg = '○ нужно: ' + [...st.missing.map((f) => f.label.toLowerCase()), ...st.invalid.map((f) => 'верный ' + f.label.toLowerCase())].join(', ');
    ctx.fillStyle = hot ? '#1d1f22' : (st.ok ? T.ok : accent);
    fitText(ctx, msg, W - pad * 2.6, Math.round(Math.min(H * 0.105, 24)), '600');
    ctx.fillText(msg, pad * 1.3, H - pad * 1.3 - Math.min(H * 0.105, 24));
    // click hint
    ctx.fillStyle = hot ? '#2b2d31' : T.muted;
    ctx.font = `500 ${Math.round(Math.min(H * 0.085, 19))}px ${MONO}`;
    ctx.fillText('клик — настроить', pad * 1.3, H - pad * 1.3 - Math.min(H * 0.105, 24) * 2.3);
  };
}
function drawVents(big) {
  return (ctx, W, H) => {
    ctx.fillStyle = T.partHex; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = T.muted; ctx.lineWidth = 2;
    const n = big ? 14 : 6, x0 = W * 0.08, top = H * 0.3, bot = H * 0.85;
    for (let i = 0; i < n; i++) { const x = x0 + i * 7; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(W * 0.86, H * 0.72, 4, 0, Math.PI * 2); ctx.stroke();
  };
}

// ---------- scene building ----------
let root = new THREE.Group();
scene.add(root);
let pickables = [], partObjs = new Map(), slotObjs = new Map(), moduleObjs = new Map(), wires = [];
const lineMat = () => new THREE.LineBasicMaterial({ color: T.edge, transparent: true, opacity: 0.85 });

function disposeTree(o) {
  o.traverse((n) => {
    n.geometry?.dispose();
    const m = n.material;
    if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose(); x.dispose(); });
  });
}
function roundedRect(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function makeSlab(w, d, t, color) {
  const g = new THREE.Group();
  const geo = new THREE.ExtrudeGeometry(roundedRect(w, d, Math.min(w, d) * 0.05), { depth: t, bevelEnabled: false, curveSegments: 8 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, -t, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  g.add(mesh);
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), lineMat()));
  const inset = new THREE.BufferGeometry().setFromPoints(roundedRect(w - 0.8, d - 0.8, Math.min(w, d) * 0.04).getPoints(10).map((p) => new THREE.Vector3(p.x, 0.005, -p.y)));
  const il = new THREE.LineLoop(inset, new THREE.LineBasicMaterial({ color: T.edge, transparent: true, opacity: 0.25 }));
  g.add(il);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.14, 20), new THREE.MeshBasicMaterial({ color: T.edge, transparent: true, opacity: 0.45 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(sx * (w / 2 - 0.4), 0.006, sz * (d / 2 - 0.4));
    g.add(ring);
  }
  g.userData.mesh = mesh;
  return g;
}
function flatLabel(text, wu, hu, size, color, x, z, rot = 0) {
  const tex = canvasTex(wu, hu, 96, (ctx, W, H) => {
    ctx.fillStyle = color; ctx.textBaseline = 'middle';
    ctx.font = `600 ${size}px ${MONO}`;
    spaced(ctx, text, 4, H / 2, 5);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wu, hu), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.set(-Math.PI / 2, 0, rot);
  m.position.set(x, 0.01, z);
  return m;
}
function makePart(part, scale = 1, mini = false) {
  const w = part.w * scale, d = part.d * scale, h = part.h * (mini ? 0.5 : 1) * scale;
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, h / 2, 0);
  const side = new THREE.MeshStandardMaterial({ color: T.side, roughness: 0.9 });
  const big = part.w * part.d > 9;
  const front = mini ? side : new THREE.MeshStandardMaterial({ map: canvasTex(w, h, 64, drawVents(big)), roughness: 0.9 });
  const left = mini ? side : new THREE.MeshStandardMaterial({ map: canvasTex(d, h, 64, drawVents(false)), roughness: 0.9 });
  const top = new THREE.MeshBasicMaterial({ map: canvasTex(w, d, mini ? 24 : 128, drawPartTop(part, false, mini)) });
  const mesh = new THREE.Mesh(geo, [side, left, top, side, front, side]);
  const g = new THREE.Group();
  g.add(mesh);
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat()));
  g.position.set(part.x * scale, 0, part.z * scale);
  g.userData = { mesh, part, h, scale, mini, top };
  return g;
}
function redrawTop(obj, hot) {
  const { part, mini, top, scale } = obj.userData;
  top.map.dispose();
  top.map = canvasTex(part.w * scale, part.d * scale, mini ? 24 : 128, drawPartTop(part, hot, mini));
  top.needsUpdate = true;
}
function makeSlot(slot) {
  const g = new THREE.Group();
  const tex = canvasTex(slot.w, slot.d, 128, (ctx, W, H) => drawSlot(ctx, W, H, slot, false));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(slot.w, slot.d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.012;
  g.add(m);
  g.position.set(slot.x, 0, slot.z);
  g.userData = { mesh: m, slot };
  return g;
}
function drawSlot(ctx, W, H, slot, hot) {
  ctx.clearRect(0, 0, W, H);
  if (hot) { ctx.fillStyle = accent; ctx.globalAlpha = 0.18; ctx.fillRect(6, 6, W - 12, H - 12); ctx.globalAlpha = 1; }
  ctx.setLineDash([14, 10]); ctx.lineWidth = 4; ctx.strokeStyle = hot ? accent : T.muted;
  ctx.strokeRect(6, 6, W - 12, H - 12); ctx.setLineDash([]);
  ctx.fillStyle = hot ? accent : T.muted; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.font = `300 ${Math.round(H * 0.32)}px ${MONO}`;
  ctx.fillText('+', W / 2, H * 0.36);
  fitText(ctx, slot.label, W - 30, Math.round(H * 0.13), '600');
  ctx.fillText(slot.label, W / 2, H * 0.66);
  ctx.font = `500 ${Math.round(H * 0.085)}px ${MONO}`;
  ctx.fillText('пустой слот · ' + KINDS[slot.kind].short, W / 2, H * 0.82);
  ctx.textAlign = 'left';
}
function redrawSlot(obj, hot) {
  const { mesh, slot } = obj.userData;
  mesh.material.map.dispose();
  mesh.material.map = canvasTex(slot.w, slot.d, 128, (ctx, W, H) => drawSlot(ctx, W, H, slot, hot));
  mesh.material.needsUpdate = true;
}
function arc(a, b, ha, hb) {
  const A = new THREE.Vector3(a.x, ha, a.z), B = new THREE.Vector3(b.x, hb, b.z);
  const dist = A.distanceTo(B);
  const M = A.clone().lerp(B, 0.5); M.y = Math.max(ha, hb) + 0.8 + dist * 0.28;
  return new THREE.QuadraticBezierCurve3(A, M, B);
}
function makeWire(curve) {
  const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: T.wire, transparent: true, opacity: 0.8 }));
}

let view = 'system';
function build() {
  disposeTree(root); scene.remove(root);
  root = new THREE.Group(); scene.add(root);
  pickables = []; partObjs.clear(); slotObjs.clear(); moduleObjs.clear(); wires = []; pulses.length = 0; hovered = null;
  scene.background = new THREE.Color(T.bg);
  if (view === 'system') buildSystem(); else buildBoard(view);
  renderUI();
}
function buildBoard(id) {
  const def = boardDef(id), bs = state.boards[id];
  const [w, d] = def.size;
  root.add(makeSlab(w, d, 0.35, T.board));
  root.add(flatLabel(`${def.en} · ${def.title.toUpperCase()}`, 9, 0.6, 30, T.muted, -w / 2 + 5.2, d / 2 - 0.62));
  for (const part of bs.parts) {
    const o = makePart(part); root.add(o); partObjs.set(part.uid, o); pickables.push(o.userData.mesh);
    o.userData.mesh.userData.pick = { type: 'part', uid: part.uid };
  }
  for (const slot of bs.slots) {
    const o = makeSlot(slot); root.add(o); slotObjs.set(slot.uid, o); pickables.push(o.userData.mesh);
    o.userData.mesh.userData.pick = { type: 'slot', uid: slot.uid };
  }
  for (const [a, b] of bs.links) addWire(a, b);
}
function addWire(a, b) {
  const A = partObjs.get(a), B = partObjs.get(b);
  if (!A || !B) return;
  const line = makeWire(arc(A.position, B.position, A.userData.h, B.userData.h));
  root.add(line);
  wires.push({ a, b, line });
}
function refreshWires(uid) {
  for (const wobj of wires) {
    if (uid && wobj.a !== uid && wobj.b !== uid) continue;
    const A = partObjs.get(wobj.a), B = partObjs.get(wobj.b);
    wobj.line.geometry.dispose();
    wobj.line.geometry = new THREE.BufferGeometry().setFromPoints(arc(A.position, B.position, A.userData.h, B.userData.h).getPoints(48));
  }
}
const MOD = 0.36;
function buildSystem() {
  const [w, d] = SYSTEM.size;
  root.add(makeSlab(w, d, 0.4, T.board));
  root.add(flatLabel('AGENT SYSTEM · ' + state.name.toUpperCase(), 10, 0.6, 30, T.muted, -w / 2 + 5.6, d / 2 - 0.62));
  for (const b of BOARDS) {
    const [x, z] = SYSTEM.layout[b.id];
    const g = new THREE.Group();
    const bw = b.size[0] * MOD, bd = b.size[1] * MOD, stand = 0.55;
    const slab = makeSlab(bw, bd, 0.22, T.board);
    slab.position.y = stand;
    g.add(slab);
    // стойки
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, stand - 0.22, 8), new THREE.MeshStandardMaterial({ color: T.side }));
      c.position.set(sx * (bw / 2 - 0.3), (stand - 0.22) / 2, sz * (bd / 2 - 0.3)); g.add(c);
    }
    const inner = new THREE.Group(); inner.position.y = stand; g.add(inner);
    for (const part of state.boards[b.id].parts) inner.add(makePart(part, MOD, true));
    const st = boardStatus(b.id);
    const lbl = flatLabel(`${b.key} · ${b.title.toUpperCase()}  ${st.ready}/${st.total}`, 6, 0.55, 30, T.text, x - bw / 2 + 3, z + bd / 2 + 0.45);
    root.add(lbl);
    g.position.set(x, 0, z);
    // невидимая зона клика
    const hit = new THREE.Mesh(new THREE.BoxGeometry(bw, 1.6, bd), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.8; g.add(hit);
    hit.userData.pick = { type: 'module', id: b.id };
    pickables.push(hit);
    g.userData = { slab, board: b, h: stand + 0.6 };
    root.add(g); moduleObjs.set(b.id, g);
  }
  for (const [a, b] of SYSTEM.links) {
    const A = moduleObjs.get(a), B = moduleObjs.get(b);
    const line = makeWire(arc(A.position, B.position, 0.9, 0.9));
    root.add(line); wires.push({ a, b, line });
  }
}
function setModuleHot(id, hot) {
  const g = moduleObjs.get(id); if (!g) return;
  g.userData.slab.userData.mesh.material.color.set(hot ? accent : T.board);
}

// ---------- pulses / demo ----------
const pulses = [];
function sendPulse(curve, dur = 1100, reverse = false) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(view === 'system' ? 0.2 : 0.16, 16, 12), new THREE.MeshBasicMaterial({ color: accent }));
  root.add(m);
  pulses.push({ m, curve, t0: performance.now(), dur, reverse });
}
let demoTimer = null;
function stopDemo() {
  clearTimeout(demoTimer); demoTimer = null;
  $('#demoBtn').classList.remove('on');
  if (view === 'system') for (const id of moduleObjs.keys()) setModuleHot(id, false);
  else for (const o of partObjs.values()) redrawTop(o, false);
  setInfo();
}
function startDemo() {
  if (demoTimer) return stopDemo();
  $('#demoBtn').classList.add('on');
  const steps = view === 'system' ? systemDemo() : boardDemo(view);
  let i = 0, prev = null;
  const tick = () => {
    if (i >= steps.length) { demoTimer = setTimeout(() => { stopDemo(); setInfo('Демо завершено', 'Это симуляция потока данных по собранной схеме. Детали без ключей отмечены оранжевым индикатором.'); }, 1400); return; }
    const s = steps[i++];
    s.run(prev);
    prev = s;
    setInfo(s.title, s.text);
    demoTimer = setTimeout(tick, 1900);
  };
  tick();
}
function systemDemo() {
  return SYSTEM.demo.map(([id, text], idx) => ({
    title: `Шаг ${idx + 1}/${SYSTEM.demo.length} · ${boardDef(id).title}`,
    text,
    id,
    run(prev) {
      for (const k of moduleObjs.keys()) setModuleHot(k, k === id);
      if (prev) {
        const A = moduleObjs.get(prev.id).position, B = moduleObjs.get(id).position;
        sendPulse(arc(A, B, 0.9, 0.9), 1300);
      }
      const st = boardStatus(id);
      if (st.ready < st.total) this.text = text + ` ⚠ На плате «${boardDef(id).title}» не настроено деталей: ${st.total - st.ready}.`;
    },
  }));
}
function boardDemo(id) {
  const bs = state.boards[id], def = boardDef(id);
  const hub = bs.parts.find((p) => p.uid === def.hub) ? def.hub : bs.parts[0]?.uid;
  const steps = [];
  for (const [a, b] of bs.links) {
    const pa = bs.parts.find((p) => p.uid === a), pb = bs.parts.find((p) => p.uid === b);
    if (!pa || !pb) continue;
    const sa = partStatus(pa), sb = partStatus(pb);
    steps.push({
      title: `${KINDS[pa.kind].label} → ${KINDS[pb.kind].label}`,
      text: `${variantOf(pa).name}: ${variantOf(pa).desc}` + (!sa.ok || !sb.ok ? ` ⚠ Не заполнено: ${[...sa.missing, ...sa.invalid, ...sb.missing, ...sb.invalid].map((f) => f.label).join(', ')}.` : ' ✓ Связь готова.'),
      run() {
        for (const [uid, o] of partObjs) redrawTop(o, uid === a || uid === b);
        const A = partObjs.get(a), B = partObjs.get(b);
        sendPulse(arc(A.position, B.position, A.userData.h, B.userData.h));
      },
    });
  }
  if (!steps.length && hub) steps.push({ title: 'Нет связей', text: 'Добавьте детали — они автоматически подключатся к центральному блоку.', run() {} });
  return steps;
}

// ---------- picking / drag ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let hovered = null, down = null, dragging = null;
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  return hit ? hit.object.userData.pick : null;
}
function setHover(p) {
  const same = hovered && p && hovered.type === p.type && (hovered.uid ?? hovered.id) === (p.uid ?? p.id);
  if (same) return;
  if (hovered && !demoTimer) applyHot(hovered, false);
  hovered = p;
  renderer.domElement.style.cursor = p ? 'pointer' : 'grab';
  if (p && !demoTimer) applyHot(p, true);
  if (!demoTimer) setInfo(...(p ? infoFor(p) : []));
}
function applyHot(p, hot) {
  if (p.type === 'part') { const o = partObjs.get(p.uid); if (o) redrawTop(o, hot); }
  else if (p.type === 'slot') { const o = slotObjs.get(p.uid); if (o) redrawSlot(o, hot); }
  else if (p.type === 'module') setModuleHot(p.id, hot);
}
function infoFor(p) {
  if (p.type === 'module') {
    const b = boardDef(p.id), st = boardStatus(p.id);
    return [b.title, `${b.desc} Готово ${st.ready}/${st.total}, ключей ${st.secretsSet}/${st.secrets}, пустых слотов ${st.empty}. Клик — открыть плату.`];
  }
  const bs = state.boards[view];
  if (p.type === 'slot') { const s = bs.slots.find((x) => x.uid === p.uid); return [`Пустой слот: ${s.label}`, `Сюда ставится деталь типа «${KINDS[s.kind].label}». Клик — выбрать вариант.`]; }
  const part = bs.parts.find((x) => x.uid === p.uid), v = variantOf(part), st = partStatus(part);
  return [`${KINDS[part.kind].label} · ${v.name}`, `${v.desc} ${st.ok ? '✓ Настроено.' : '⚠ Нужно: ' + [...st.missing, ...st.invalid].map((f) => f.label).join(', ') + '.'} Клик — настроить или заменить, перетаскивание — переставить на плате.`];
}
const el = renderer.domElement;
el.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const p = pick(e);
  down = { x: e.clientX, y: e.clientY, p };
  if (p && p.type === 'part') {
    controls.enabled = false;
    const o = partObjs.get(p.uid);
    ray.ray.intersectPlane(plane, hitP);
    down.off = { x: o.position.x - hitP.x, z: o.position.z - hitP.z };
    down.orig = { x: o.position.x, z: o.position.z };
  }
});
el.addEventListener('pointermove', (e) => {
  if (down && down.p && down.p.type === 'part') {
    if (!dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { dragging = down.p.uid; el.style.cursor = 'grabbing'; }
    if (dragging) {
      pick(e);
      if (ray.ray.intersectPlane(plane, hitP)) {
        const o = partObjs.get(dragging), def = boardDef(view), part = o.userData.part;
        const hw = def.size[0] / 2 - part.w / 2 - 0.45, hd = def.size[1] / 2 - part.d / 2 - 0.45;
        o.position.x = Math.max(-hw, Math.min(hw, Math.round((hitP.x + down.off.x) * 5) / 5));
        o.position.z = Math.max(-hd, Math.min(hd, Math.round((hitP.z + down.off.z) * 5) / 5));
        const bad = overlaps(part, o.position.x, o.position.z);
        o.userData.mesh.material[2].color.set(bad ? 0xff8080 : 0xffffff);
        refreshWires(dragging);
      }
      return;
    }
  }
  if (!e.buttons) setHover(pick(e));
});
addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5;
  if (dragging) {
    const o = partObjs.get(dragging), part = o.userData.part;
    o.userData.mesh.material[2].color.set(0xffffff);
    if (overlaps(part, o.position.x, o.position.z)) { o.position.set(down.orig.x, 0, down.orig.z); toast('Здесь занято — деталь вернулась на место'); }
    else { part.x = o.position.x; part.z = o.position.z; save(); }
    refreshWires(dragging);
    dragging = null;
  } else if (!moved && down.p && e.target === el) {
    const p = down.p;
    if (p.type === 'module') enter(p.id);
    else if (p.type === 'part') openPart(p.uid);
    else if (p.type === 'slot') openSlot(p.uid);
  }
  controls.enabled = true;
  down = null;
});
function overlaps(part, x, z, gap = 0.25) {
  const bs = state.boards[view];
  const others = [...bs.parts.filter((p) => p.uid !== part.uid), ...bs.slots];
  return others.some((o) => Math.abs(o.x - x) < (o.w + part.w) / 2 + gap && Math.abs(o.z - z) < (o.d + part.d) / 2 + gap);
}
function freeSpot(w, d) {
  const def = boardDef(view);
  const hw = def.size[0] / 2 - w / 2 - 0.5, hd = def.size[1] / 2 - d / 2 - 0.5;
  const probe = { uid: '__probe', w, d };
  for (let z = -hd; z <= hd; z += 0.4) for (let x = -hw; x <= hw; x += 0.4) if (!overlaps(probe, x, z)) return { x: Math.round(x * 5) / 5, z: Math.round(z * 5) / 5 };
  return null;
}

// ---------- UI ----------
function setInfo(title, text) {
  if (title == null) {
    if (view === 'system') { title = state.name; text = 'Агентская система собирается из плат. Каждая плата — отдельная часть: каналы, контроль, оркестратор, ядро LLM, память, инструменты. Клик по плате — открыть её, клик по детали — ввести API-ключ, заменить или удалить деталь. Код писать не нужно.'; }
    else { const d = boardDef(view); title = d.title; text = d.desc + ' Клик по детали — настройки и ключи, по пунктирному слоту — добавить деталь. Детали можно перетаскивать.'; }
  }
  $('#infoT').textContent = title;
  $('#infoX').textContent = text;
}
function renderUI() {
  $('#crumb').innerHTML = view === 'system' ? `<b id="projName" title="Переименовать проект">${esc(state.name)}</b>` : `<a href="#" id="toSys" title="Вся система">${esc(state.name)}</a> <span style="color:var(--muted)">/</span> <b>${esc(boardDef(view).title)}</b>`;
  $('#toSys')?.addEventListener('click', (e) => { e.preventDefault(); enter('system'); });
  $('#projName')?.addEventListener('click', renameProject);
  const nav = [`<button class="pb${view === 'system' ? ' on' : ''}" data-b="system"><span>Вся система</span><kbd>0</kbd></button>`];
  for (const b of BOARDS) {
    const st = boardStatus(b.id);
    nav.push(`<button class="pb${view === b.id ? ' on' : ''}" data-b="${b.id}"><span>${esc(b.title)}</span><i class="${st.ready === st.total ? 'ok' : ''}">${st.ready}/${st.total}</i><kbd>${b.key}</kbd></button>`);
  }
  $('#boards').innerHTML = nav.join('');
  $('#boards').querySelectorAll('.pb').forEach((x) => x.addEventListener('click', () => enter(x.dataset.b)));
  $('#addBtn').style.display = view === 'system' ? 'none' : '';
  let tot = 0, rdy = 0, sec = 0, secSet = 0, empty = 0;
  for (const b of BOARDS) { const s = boardStatus(b.id); tot += s.total; rdy += s.ready; sec += s.secrets; secSet += s.secretsSet; empty += s.empty; }
  let statTxt = `деталей ${tot} · готово ${rdy}/${tot} · ключей ${secSet}/${sec} · пустых слотов ${empty}`;
  const curRub = estimate(state, costA()).current?.rub;
  if (curRub != null) statTxt += ` · ${fmtRub(curRub)}`;
  $('#stat').textContent = statTxt;
  $('#stat').style.cursor = 'pointer';
  $('#stat').onclick = openCost;
  $('#dots').innerHTML = ACCENTS.map((c) => `<button style="--c:${c}" class="${c === accent ? 'on' : ''}" data-c="${c}" aria-label="Цвет ${c}"></button>`).join('');
  $('#dots').querySelectorAll('button').forEach((x) => x.addEventListener('click', () => { accent = x.dataset.c; localStorage.setItem(STORE + ':accent', accent); document.documentElement.style.setProperty('--accent', accent); build(); }));
  document.documentElement.style.setProperty('--accent', accent);
  document.body.dataset.theme = themeName;
  setInfo();
}
function enter(id) {
  stopDemo();
  closeModal();
  view = id;
  const size = id === 'system' ? SYSTEM.size : boardDef(id).size;
  el.classList.add('fade');
  setTimeout(() => { build(); fitCamera(size[0], size[1]); el.classList.remove('fade'); }, 120);
  history.replaceState(null, '', id === 'system' ? location.pathname : '#' + id);
}
function renameProject() {
  const n = prompt('Название проекта', state.name);
  if (n && n.trim()) { state.name = n.trim().slice(0, 60); save(); build(); }
}
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---------- modal ----------
const modal = $('#modal');
function openModal(html, onMount) {
  $('#mBody').innerHTML = html;
  modal.classList.add('open');
  onMount?.($('#mBody'));
  const f = $('#mBody').querySelector('input,textarea,select');
  f?.focus();
}
function closeModal() { modal.classList.remove('open'); }
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

function fieldHtml(f, val) {
  const id = 'f_' + f.k, req = f.req ? '<em>*</em>' : '';
  const v = esc(val ?? '');
  let input;
  if (f.t === 'select') input = `<select id="${id}" name="${f.k}">${f.opt.map((o) => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (f.t === 'textarea') input = `<textarea id="${id}" name="${f.k}" rows="3" placeholder="${esc(f.ph || '')}">${v}</textarea>`;
  else if (f.t === 'secret') input = `<div class="sec"><input id="${id}" name="${f.k}" type="password" autocomplete="off" spellcheck="false" placeholder="${esc(f.ph || 'вставьте значение')}" value="${v}"><button type="button" class="eye" data-for="${id}" title="Показать">👁</button></div>`;
  else {
    const list = f.opt ? `<datalist id="${id}_l">${f.opt.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : '';
    input = `<input id="${id}" name="${f.k}" type="${f.t === 'number' ? 'number' : f.t === 'url' ? 'url' : 'text'}" step="any" ${f.opt ? `list="${id}_l"` : ''} placeholder="${esc(f.ph || '')}" value="${v}">${list}`;
  }
  return `<label class="fld${f.t === 'secret' ? ' key' : ''}" for="${id}"><span>${esc(f.label)}${req}${f.t === 'secret' ? ' <small>🔑</small>' : ''}</span>${input}</label>`;
}
function partForm(part, variantId, values) {
  const k = KINDS[part.kind], v = k.variants.find((x) => x.id === variantId);
  const links = [];
  if (v.keyUrl) links.push(`<a href="${esc(v.keyUrl)}" target="_blank" rel="noopener">🔑 Где взять ключ ↗</a>`);
  if (v.catalog) links.push(`<a href="https://qantcore.space/product/${esc(v.catalog)}/" target="_blank">Карточка в каталоге →</a>`);
  const partners = (v.partners || []).map((id) => PARTNERS[id]).filter(Boolean);
  return `
    <div class="swap"><span>Деталь</span><div class="chips">${k.variants.map((x) => `<button type="button" class="chip${x.id === v.id ? ' on' : ''}" data-v="${x.id}">${esc(x.name)}</button>`).join('')}</div></div>
    <p class="vd">${esc(v.desc)}</p>
    <div class="fields">${v.fields.map((f) => fieldHtml(f, values[f.k] ?? f.def)).join('')}</div>
    ${part.kind === 'llm' ? `<div class="plinks"><span id="lcost"></span> · <a href="#" class="clink">сравнить →</a></div>` : ''}
    ${links.length || partners.length ? `<div class="plinks">${links.join('')}${partners.length ? `<div class="prow"><span>${esc(v.partnerText || '')}</span>${partners.map((pn, i) => `<a class="pchip" href="${esc(pn.url)}" target="_blank" rel="nofollow sponsored noopener" data-partner="${esc(v.partners[i])}">${esc(pn.name)} ↗</a>`).join('')}<small>партнёрские ссылки</small></div>` : ''}</div>` : ''}`;
}
function openPart(uid) {
  stopDemo();
  const bs = state.boards[view], part = bs.parts.find((p) => p.uid === uid);
  let cur = part.variant;
  let draft = { ...part.values };
  const k = KINDS[part.kind];
  const shell = () => `
    <div class="mh"><div><small>${esc(boardDef(view).title)} · ${esc(k.short)}</small><h3>${esc(k.label)}</h3></div><button class="x" data-close>✕</button></div>
    <form id="pf" novalidate autocomplete="off">${partForm(part, cur, draft)}
      <p class="note">Ключи хранятся только в этом браузере (localStorage) и не отправляются на сервер Qantcore. В экспорт попадают, только если вы это явно включите.</p>
      <div class="ma"><button type="button" class="btn danger" id="delPart">Снять с платы</button><span></span><button type="button" class="btn" data-close>Отмена</button><button class="btn primary" type="submit">Сохранить</button></div>
    </form>`;
  const mount = (box) => {
    box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    box.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
      collect(box);
      const nv = k.variants.find((x) => x.id === b.dataset.v);
      const ov = k.variants.find((x) => x.id === cur);
      for (const f of nv.fields) {
        const fa = ov.fields.find((x) => x.k === f.k), val = draft[f.k];
        const matched = val == null || String(val).trim() === '' || val === fa?.def || fa?.opt?.includes(val);
        if (matched) draft[f.k] = f.def != null ? f.def : '';
      }
      cur = b.dataset.v;
      openModal(shell(), mount);
    }));
    box.querySelectorAll('.eye').forEach((b) => b.addEventListener('click', () => { const i = box.querySelector('#' + b.dataset.for); i.type = i.type === 'password' ? 'text' : 'password'; }));
    box.querySelectorAll('.clink').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openCost(); }));
    const lcostEl = box.querySelector('#lcost');
    if (lcostEl && part.kind === 'llm') {
      const mi = box.querySelector('[name="model"]');
      const upd = () => {
        const price = priceOf(cur, (mi?.value ?? draft.model) || '');
        const rub = costRub(price, costA(), llmCalls(state, costA()));
        lcostEl.innerHTML = cur === 'ollama' ? '0 ₽ за токены' : rub != null ? `${fmtRub(rub)} при текущих допущениях` : `<a href="${esc(PRICE_SRC[cur] || '#')}" target="_blank" rel="noopener">цена не подтверждена — тариф ↗</a>`;
      };
      mi?.addEventListener('input', upd);
      upd();
    }
    box.querySelectorAll('.pchip').forEach((a) => a.addEventListener('click', () => {
      const v = k.variants.find((x) => x.id === cur);
      window.qcTrackAffiliateClick?.(a, v?.catalog || '', 'ai_engineer_' + part.kind, a.dataset.partner, { variant: cur });
    }));
    box.querySelector('#pf').addEventListener('submit', (e) => {
      e.preventDefault(); collect(box);
      const v = k.variants.find((x) => x.id === cur);
      part.variant = cur;
      // убрать значения полей, которых нет у нового варианта
      const keep = new Set(v.fields.map((f) => f.k));
      part.values = {};
      for (const key of Object.keys(draft)) if (keep.has(key)) part.values[key] = draft[key];
      save(); closeModal(); build();
      const st = partStatus(part);
      const probs = [];
      if (st.missing.length) probs.push('Ещё нужно: ' + st.missing.map((f) => f.label).join(', '));
      if (st.invalid.length) probs.push('Неверный URL: ' + st.invalid.map((f) => f.label).join(', '));
      toast(st.ok ? `✓ ${v.name}: настроено` : `Сохранено. ${probs.join(' · ')}`);
    });
    box.querySelector('#delPart').addEventListener('click', () => {
      bs.parts = bs.parts.filter((p) => p.uid !== uid);
      bs.links = bs.links.filter(([a, b]) => a !== uid && b !== uid);
      bs.slots.push({ uid: 'slot' + state.seq++, kind: part.kind, label: k.label, x: part.x, z: part.z, w: part.w, d: part.d, h: part.h });
      save(); closeModal(); build(); toast('Деталь снята — на её месте пустой слот');
    });
  };
  const collect = (box) => box.querySelectorAll('[name]').forEach((i) => { draft[i.name] = i.value.trim(); });
  openModal(shell(), mount);
}
function placePart(kind, variant, at, size) {
  const bs = state.boards[view], def = boardDef(view);
  const uid = kind + '_' + state.seq++;
  const part = { uid, id: uid, kind, variant, x: at.x, z: at.z, w: size.w, d: size.d, h: size.h, values: defaults(kind, variant) };
  bs.parts.push(part);
  const hub = bs.parts.find((p) => p.uid === def.hub);
  if (hub && hub.uid !== uid) bs.links.push(kind === 'llm' || ['channels', 'memory'].includes(view) ? [uid, hub.uid] : [hub.uid, uid].reverse());
  save(); build();
  return uid;
}
function variantCards(kind) {
  return `<div class="cards">${KINDS[kind].variants.map((v) => `<button type="button" class="card" data-v="${v.id}"><b>${esc(v.name)}</b><span>${esc(v.desc)}</span><small>${v.fields.filter((f) => f.t === 'secret').length ? '🔑 нужен ключ' : 'без ключа'}</small></button>`).join('')}</div>`;
}
function openSlot(uid) {
  stopDemo();
  const bs = state.boards[view], slot = bs.slots.find((s) => s.uid === uid), k = KINDS[slot.kind];
  openModal(`
    <div class="mh"><div><small>${esc(boardDef(view).title)} · пустой слот</small><h3>${esc(slot.label)}: выберите деталь</h3></div><button class="x" data-close>✕</button></div>
    ${variantCards(slot.kind)}
    <div class="ma"><button type="button" class="btn danger" id="delSlot">Убрать слот</button><span></span><button type="button" class="btn" data-close>Отмена</button></div>`, (box) => {
    box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    box.querySelector('#delSlot').addEventListener('click', () => { bs.slots = bs.slots.filter((s) => s.uid !== uid); save(); closeModal(); build(); });
    box.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => {
      bs.slots = bs.slots.filter((s) => s.uid !== uid);
      const pid = placePart(slot.kind, c.dataset.v, { x: slot.x, z: slot.z }, { w: slot.w, d: slot.d, h: slot.h });
      toast(`${k.label} установлен — заполните настройки`);
      openPart(pid);
    }));
  });
}
const fmtNum = (x) => new Intl.NumberFormat('ru-RU').format(Math.round(x));
function fmtRub(rub) {
  if (rub == null) return null;
  if (rub === 0) return '0 ₽ за токены';
  if (rub < 1) return '< 1 ₽';
  return '≈ ' + fmtNum(rub) + ' ₽/мес';
}
const FOREIGN = ['openai', 'anthropic', 'gemini', 'deepseek', 'qwen'];
const VARIANT_NAME = (vid) => KINDS.llm.variants.find((x) => x.id === vid)?.name || vid;

function openCost() {
  stopDemo();
  const a = costA();
  const est = estimate(state, a);
  const cur = est.current;
  const head = !cur ? 'Нет детали LLM на плате ядра'
    : cur.variant === 'ollama' ? '0 ₽ за токены'
    : cur.rub != null ? fmtRub(cur.rub)
    : `<a href="${esc(PRICE_SRC[cur.variant] || '#')}" target="_blank" rel="noopener">цена не подтверждена — тариф ↗</a>`;
  const curModel = cur ? (cur.model || KINDS.llm.variants.find((x) => x.id === cur.variant)?.fields.find((f) => f.k === 'model')?.def || '') : '';
  const showPartners = (cur && FOREIGN.includes(cur.variant)) || (est.options[0] && FOREIGN.includes(est.options[0].variant));
  const partnerChips = ['polza', 'bothub', 'gptunnel'].map((id) => `<a class="pchip" href="${esc(PARTNERS[id].url)}" target="_blank" rel="nofollow sponsored noopener" data-partner="${id}">${esc(PARTNERS[id].name)} ↗</a>`).join('');
  const fmtRate = (p) => p.cur === 'RUB' ? `${p.in} ₽ / ${p.out} ₽` : `$${p.in} / $${p.out}`;
  const rows = est.options.map((o) => {
    const isCur = cur && o.variant === cur.variant && o.model === curModel;
    const key = `${o.variant}|${o.model}`;
    return `<tr class="crow${isCur ? ' cur' : ''}" data-key="${esc(key)}"><td>${esc(o.model)}${o.price?.note ? `<br><small>${esc(o.price.note)}</small>` : ''}</td><td>${esc(VARIANT_NAME(o.variant))}</td><td class="cost" data-rub>${o.rub != null ? fmtNum(o.rub) + ' ₽' : '—'}</td><td>${fmtRate(o.price)}</td><td>${isCur ? 'текущая' : `<button type="button" class="btn" data-pick="${esc(key)}">Выбрать</button>`}</td></tr>`;
  }).join('');
  const ollamaCur = cur?.variant === 'ollama';
  const inputs = [['dialogs', 'Диалогов в месяц'], ['msgs', 'Сообщений в диалоге'], ['inTok', 'Токенов на входе'], ['outTok', 'Токенов на выходе'], ['fx', 'Курс $ (₽)']];
  openModal(`
    <div class="mh"><div><small>Калькулятор</small><h3>Стоимость агента в месяц</h3></div><button class="x" data-close>✕</button></div>
    <div class="chead" id="chead">${head}</div>
    <p class="vd" id="csub">${cur ? `${fmtNum(est.calls)} вызовов LLM · ${esc(curModel)}` : ''}${cur?.price?.note ? ` · ${esc(cur.price.note)}` : ''}</p>
    <div class="cf">${inputs.map(([k, label]) => `<label class="fld"><span>${label}</span><input type="number" step="any" id="cx_${k}" value="${a[k]}"></label>`).join('')}</div>
    ${hasTools(state) ? '<p class="note" style="margin:6px 0 0">Инструменты на плате → ×2 вызова на сообщение</p>' : ''}
    <table class="ctable"><thead><tr><th>Модель</th><th>Провайдер</th><th>₽/мес</th><th>за 1M вх/вых</th><th></th></tr></thead><tbody>${rows}
      <tr class="crow${ollamaCur ? ' cur' : ''}"><td>ollama (любая)</td><td>${esc(VARIANT_NAME('ollama'))}</td><td>0 ₽ за токены + сервер</td><td>$0 / $0</td><td>${ollamaCur ? 'текущая' : '<button type="button" class="btn" data-pick="ollama">Выбрать</button>'}</td></tr>
    </tbody></table>
    ${showPartners ? `<div class="prow" style="margin-top:10px"><span>Нет зарубежной карты? Эти модели доступны с оплатой в рублях:</span>${partnerChips}<small>партнёрские ссылки</small></div>` : ''}
    ${cur?.variant === 'ollama' ? `<div class="prow" style="margin-top:10px"><span>Сервер под Ollama:</span><a class="pchip" href="${esc(PARTNERS['reg-ru'].url)}" target="_blank" rel="nofollow sponsored noopener" data-partner="reg-ru">${esc(PARTNERS['reg-ru'].name)} ↗</a><small>партнёрские ссылки</small></div>` : ''}
    <p class="note" style="margin-top:12px">Цены с официальных сайтов на ${esc(PRICES_CHECKED)}, курс ЦБ. Это прикидка, а не счёт.</p>`, (box) => {
    box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    const recompute = () => {
      for (const [k] of inputs) { const el = box.querySelector('#cx_' + k); const v = parseFloat(el.value); if (!isNaN(v)) state.cost[k] = v; }
      save();
      const e2 = estimate(state, costA()), c2 = e2.current;
      box.querySelector('#chead').innerHTML = !c2 ? 'Нет детали LLM на плате ядра' : c2.variant === 'ollama' ? '0 ₽ за токены' : c2.rub != null ? fmtRub(c2.rub) : `<a href="${esc(PRICE_SRC[c2.variant] || '#')}" target="_blank" rel="noopener">цена не подтверждена — тариф ↗</a>`;
      box.querySelector('#csub').textContent = c2 ? `${fmtNum(e2.calls)} вызовов LLM · ${curModel}${c2.price?.note ? ' · ' + c2.price.note : ''}` : '';
      e2.options.forEach((o) => { const cell = box.querySelector(`tr[data-key="${o.variant}|${o.model}"] td[data-rub]`); if (cell) cell.textContent = o.rub != null ? fmtNum(o.rub) + ' ₽' : '—'; });
    };
    for (const [k] of inputs) box.querySelector('#cx_' + k).addEventListener('input', recompute);
    box.querySelector('#cx_fx').addEventListener('input', () => { if (!isNaN(parseFloat(box.querySelector('#cx_fx').value))) state.cost.fxManual = true; });
    box.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
      const part = state.boards.core.parts.find((p) => p.kind === 'llm');
      if (!part) { toast('На плате ядра нет детали LLM'); return; }
      const opt = b.dataset.pick === 'ollama' ? { variant: 'ollama', model: 'qwen3:8b' } : { variant: b.dataset.pick.split('|')[0], model: b.dataset.pick.split('|').slice(1).join('|') };
      if (opt.variant === part.variant) part.values.model = opt.model;
      else { part.variant = opt.variant; part.values = defaults('llm', opt.variant); part.values.model = opt.model; }
      save(); build(); openCost();
      toast(`Модель: ${opt.model}`);
    }));
    box.querySelectorAll('.pchip').forEach((a) => a.addEventListener('click', () => {
      window.qcTrackAffiliateClick?.(a, '', 'ai_engineer_cost', a.dataset.partner, { variant: cur?.variant || '', model: curModel });
    }));
  });
}
// ---------- живой запуск ----------
let runOpen = false, running = false, runHist = [], errBoard = null;
function toggleRun(open) {
  runOpen = open ?? !runOpen;
  $('#run').classList.toggle('open', runOpen);
  $('#runBtn').classList.toggle('on', runOpen);
  if (runOpen) { enter('system'); stopDemo(); renderRunGate(); $('#runTitle').textContent = 'Живой запуск · ' + state.name; $('#runText').focus(); }
}
function renderRunGate() {
  const cfg = prepare(state);
  const gate = $('#runProb');
  if (cfg.ok) {
    gate.style.display = cfg.unavailable.length ? '' : 'none';
    gate.innerHTML = cfg.unavailable.length ? `<span class="note">В браузере недоступно — работает в .zip: ${esc(cfg.unavailable.join(', '))}</span>` : '';
    return cfg;
  }
  gate.style.display = '';
  gate.innerHTML = `<span class="note">⚠ ${esc(cfg.reason)}</span> ` +
    (cfg.unsupported ? `<button class="btn" id="runCmp">Сравнить провайдеров</button>` : cfg.fixUid ? `<button class="btn" id="runFix">Открыть деталь</button>` : '');
  gate.querySelector('#runCmp')?.addEventListener('click', openCost);
  gate.querySelector('#runFix')?.addEventListener('click', () => { enter('core'); setTimeout(() => openPart(cfg.fixUid), 350); });
  return cfg;
}
const fmtMs = (ms) => `${Math.round(ms)} мс`;
const fmtCostSmall = (rub) => rub == null ? '—' : rub < 100 ? rub.toFixed(2).replace('.', ',') + ' ₽' : fmtNum(rub) + ' ₽';
const BOARD_T = (id) => boardDef(id)?.title || id;
function traceRows(trace, cfg) {
  const price = cfg.ok ? priceOf(cfg.llm.variant, cfg.llm.model) : null;
  const rows = [];
  for (const e of trace) {
    let label = '', ms = '', tok = '', cost = '', cls = '';
    if (e.type === 'start') label = 'запрос получен';
    else if (e.type === 'guard') { label = e.blocked ? 'политика: заблокировано' : 'политика: ок'; if (e.blocked) cls = 'bad'; }
    else if (e.type === 'llm_start') { label = `LLM · шаг ${e.step} →`; continue; }
    else if (e.type === 'llm_end') {
      label = `LLM · шаг ${e.step}${e.toolCalls ? ` · вызовов инструментов: ${e.toolCalls}` : ''}`;
      ms = fmtMs(e.ms);
      tok = e.usage ? `${e.usage.in ?? '?'} / ${e.usage.out ?? '?'} ток.` : '—';
      cost = fmtCostSmall(e.usage ? costRub(price, { ...costA(), inTok: e.usage.in || 0, outTok: e.usage.out || 0 }, 1) : null);
    } else if (e.type === 'tool_start') { label = `${esc(e.name)}(${esc(JSON.stringify(e.args || {})).slice(0, 60)})`; }
    else if (e.type === 'tool_end') {
      label = `${esc(e.name)} → ${esc(e.result.slice(0, 80))}${e.blocked ? ` · ${e.blocked === 'approval' ? 'отклонено' : 'политика'}` : ''}`;
      ms = fmtMs(e.ms); if (e.blocked) cls = 'bad';
    } else if (e.type === 'error') { label = esc(e.message); ms = fmtMs(e.ms || 0); cls = 'bad'; }
    else if (e.type === 'final') {
      label = 'итого';
      ms = fmtMs(e.totals.ms);
      tok = `${e.totals.in} / ${e.totals.out} ток.`;
      cost = fmtCostSmall(costRub(price, { ...costA(), inTok: e.totals.in, outTok: e.totals.out }, 1));
      cls = 'tot';
    }
    rows.push(`<div class="trow ${cls}"><span>${BOARD_T(e.board)}</span><span>${label}</span><span>${ms}</span><span>${tok}</span><span>${cost}</span></div>`);
  }
  return rows.join('');
}
function bubble(cls, text) {
  const d = document.createElement('div');
  d.className = 'msg ' + cls;
  d.textContent = text;
  $('#runLog').appendChild(d);
  return d;
}
function approveCard({ name, args }) {
  return new Promise((resolve) => {
    const d = document.createElement('div');
    d.className = 'msg appr';
    d.innerHTML = `<span>Агент хочет выполнить <b>${esc(name)}(${esc(JSON.stringify(args || {}).slice(0, 80))})</b></span>`;
    const ok = document.createElement('button'), no = document.createElement('button');
    ok.className = 'btn primary'; ok.textContent = 'Разрешить';
    no.className = 'btn danger'; no.textContent = 'Отклонить';
    d.append(ok, no);
    ok.onclick = () => { d.querySelectorAll('button').forEach((b) => b.disabled = true); d.classList.add('ok'); resolve(true); };
    no.onclick = () => { d.querySelectorAll('button').forEach((b) => b.disabled = true); d.classList.add('no'); resolve(false); };
    $('#runLog').appendChild(d);
    d.scrollIntoView({ block: 'nearest' });
  });
}
async function runSend() {
  const text = $('#runText').value.trim();
  if (!text || running) return;
  const cfg = renderRunGate();
  if (!cfg.ok) return;
  $('#runText').value = '';
  running = true; const sb = $('#runSend');
  sb.disabled = true; sb.textContent = '…';
  bubble('u', text);
  if (errBoard != null) { setModuleHot(errBoard, false); errBoard = null; }
  const trace = [];
  let prevBoard = null;
  const hot = (board) => {
    if (!moduleObjs.has(board)) return;
    for (const k of moduleObjs.keys()) if (k !== errBoard) setModuleHot(k, k === board);
    if (prevBoard && prevBoard !== board) {
      const A = moduleObjs.get(prevBoard), B = moduleObjs.get(board);
      if (A && B) sendPulse(arc(A.position, B.position, 0.9, 0.9), 900);
    }
    prevBoard = board;
  };
  const onEvent = (e) => {
    trace.push(e);
    if (e.board) hot(e.board);
    if (e.type === 'error') {
      errBoard = e.board;
      const g = moduleObjs.get(e.board);
      if (g) g.userData.slab.userData.mesh.material.color.set('#e5484d');
    }
  };
  let reply = '', failed = false;
  try {
    reply = await runTurn(cfg, runHist, text, { fetch: fetch.bind(window), onEvent, approve: approveCard });
  } catch (e) { reply = e.message || String(e); failed = true; }
  for (const k of moduleObjs.keys()) if (k !== errBoard) setModuleHot(k, false);
  const b = bubble(failed ? 'a err' : 'a', reply);
  const det = document.createElement('details');
  det.className = 'trace';
  det.innerHTML = `<summary>трассировка · ${trace.length}</summary><div class="trows">${traceRows(trace, cfg)}</div>`;
  b.after(det);
  running = false;
  sb.disabled = false; sb.textContent = '→';
  b.scrollIntoView({ block: 'nearest' });
}
const COMPOSE_EXAMPLES = [
  'Бот для салона красоты в Telegram: отвечает на вопросы по прайсу и записывает клиентов в Google Таблицу',
  'Помощник юриста: отвечает по нашим договорам и PDF-регламентам в чате на сайте',
  'Исследователь: каждый день ищет новости по AI в интернете и присылает отчёт в Telegram',
  'Поддержка интернет-магазина ВКонтакте и на сайте, проверяет статус заказа в 1С, на YandexGPT',
];

function openCompose(text0 = '') {
  stopDemo();
  let intent = null, tplData = null, timer = null;
  const providerName = () => { const v = state.boards.core.parts.find((p) => p.kind === 'llm')?.variant; return v ? variantOf({ kind: 'llm', variant: v }).name : 'LLM'; };
  openModal(`
    <div class="mh"><div><small>Конструктор</small><h3>Опишите агента словами</h3></div><button class="x" data-close>✕</button></div>
    <textarea id="cx_text" rows="3" placeholder="Например: бот в Telegram, отвечает по прайсу и записывает клиентов…">${esc(text0)}</textarea>
    <div class="exs">${COMPOSE_EXAMPLES.map((t, i) => `<button type="button" class="ex" data-i="${i}">${esc(t)}</button>`).join('')}</div>
    <div id="cx_preview"></div>
    <div class="ma"><button type="button" class="btn" id="cx_refine" title="">✨ Уточнить через ${esc(providerName())}</button><span></span><button type="button" class="btn" data-close>Отмена</button><button class="btn primary" id="cx_build">Собрать</button></div>`, (box) => {
    box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    const ta = box.querySelector('#cx_text');
    const pv = box.querySelector('#cx_preview');
    const renderPreview = (r, td) => {
      const composed = applyTemplate(initState(), td.tpl, null);
      const est = estimate(composed, costA());
      const byUid = {};
      for (const w of r.why || []) byUid[w.uid] = w.reason;
      const bHtml = BOARDS.map((b) => {
        const parts = composed.boards[b.id].parts;
        if (!parts.length) return '';
        return `<div class="cxb"><b>${esc(b.title)}</b>${parts.map((p) => `<div class="cxp">${esc(KINDS[p.kind].label)} · ${esc(variantOf(p).name)}${byUid[p.uid] ? `<small> — ${esc(byUid[p.uid])}</small>` : ''}</div>`).join('')}</div>`;
      }).join('');
      pv.innerHTML = `<div class="cxgrid">${bHtml}</div>` +
        (td.notes.length ? `<div class="cxnotes">${td.notes.map((n) => `<div>⚠ ${esc(n)}</div>`).join('')}</div>` : '') +
        `<p class="note">Оценка: ${fmtRub(est.current?.rub) || '—'} · модель ${esc(est.current?.model || '—')}</p>`;
    };
    const compute = () => {
      const text = ta.value.trim();
      box.querySelector('#cx_build').disabled = !text;
      if (!text) { pv.innerHTML = '<p class="note">Опишите задачу — платы соберутся автоматически.</p>'; intent = null; tplData = null; return; }
      const r = ruleIntent(text);
      intent = r.intent;
      tplData = intentToTemplate(intent, r.notes);
      renderPreview(r, tplData);
    };
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(compute, 250); });
    box.querySelectorAll('.ex').forEach((b) => b.addEventListener('click', () => { ta.value = COMPOSE_EXAMPLES[+b.dataset.i]; compute(); }));
    const rb = box.querySelector('#cx_refine');
    const cfg = prepare(state);
    if (!cfg.ok) { rb.disabled = true; rb.title = cfg.reason; }
    rb.addEventListener('click', async () => {
      const text = ta.value.trim();
      if (!text) return;
      rb.disabled = true; const old = rb.textContent; rb.textContent = '…';
      try {
        const out = await runTurn({ ...cfg, system: COMPOSE_PROMPT, tools: [], deny: [], actions: [], maxSteps: 1, params: { temperature: 0, maxTokens: 1200 } }, [], text, { fetch: fetch.bind(window), onEvent: () => {}, approve: async () => false });
        intent = normalizeIntent(parseJSONLoose(out));
        tplData = intentToTemplate(intent);
        renderPreview({ why: [] }, tplData);
      } catch (e) {
        pv.insertAdjacentHTML('afterbegin', '<div class="note" style="color:#e5484d">Не удалось разобрать ответ модели — оставил сборку по правилам</div>');
      }
      rb.disabled = false; rb.textContent = old;
    });
    box.querySelector('#cx_build').addEventListener('click', () => {
      if (!tplData || !intent) return;
      state = applyTemplate(initState(), tplData.tpl, state);
      state.name = intent.name;
      save(); closeModal(); enter('system');
      for (const [a, b] of SYSTEM.links) { const A = moduleObjs.get(a), B = moduleObjs.get(b); if (A && B) sendPulse(arc(A.position, B.position, 0.9, 0.9), 900); }
      toast(`Собрано: ${tplData.tpl.name}`);
    });
    compute();
    setTimeout(() => ta.focus(), 50);
  });
}
function openTemplates() {
  stopDemo();
  openModal(`
    <div class="mh"><div><small>Готовые конфигурации</small><h3>Шаблоны агентских систем</h3></div><button class="x" data-close>✕</button></div>
    <div class="ctop"><textarea id="tpl_text" rows="2" placeholder="Опишите агента словами — платы соберутся сами"></textarea><button class="btn primary" id="tpl_compose">Собрать →</button></div>
    <p class="vd">Один клик — и платы собраны под задачу. Текущая схема заменится; уже введённые ключи у совпадающих деталей сохранятся.</p>
    <div class="tcards">${TEMPLATES.map((tpl) => {
      const st = applyTemplate(initState(), tpl, null);
      let n = 0, keys = 0;
      for (const b of BOARDS) for (const p of st.boards[b.id].parts) { n++; keys += partStatus(p).secrets.length; }
      return `<div class="tcard${tpl.id === state.template ? ' cur' : ''}"><b>${esc(tpl.name)}${tpl.id === state.template ? ' <i>текущий</i>' : ''}</b><span>${esc(tpl.desc)}</span><small>${n} деталей · ключей ${keys}</small><button type="button" class="btn primary" data-t="${tpl.id}">Собрать</button></div>`;
    }).join('')}</div>`, (box) => {
    box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    box.querySelector('#tpl_compose')?.addEventListener('click', () => { const v = box.querySelector('#tpl_text').value.trim(); closeModal(); openCompose(v); });
    box.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => {
      const tpl = TEMPLATES.find((t) => t.id === b.dataset.t);
      state = applyTemplate(initState(), tpl, state);
      save(); enter('system');
      toast(`Шаблон «${tpl.name}» собран — заполните ключи`);
    }));
  });
}
function openAdd() {
  if (view === 'system') return;
  stopDemo();
  const kinds = Object.entries(KINDS);
  openModal(`
    <div class="mh"><div><small>${esc(boardDef(view).title)} · новая деталь</small><h3>Добавить деталь на плату</h3></div><button class="x" data-close>✕</button></div>
    <input class="search" id="kq" placeholder="Поиск: api, telegram, память…">
    <div class="kinds">${kinds.map(([id, k]) => `<button type="button" class="kind" data-k="${id}"><b>${esc(k.label)}</b><small>${esc(k.short)} · ${k.variants.map((v) => esc(v.name)).join(', ')}</small></button>`).join('')}</div>`, (box) => {
    box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    box.querySelector('#kq').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      box.querySelectorAll('.kind').forEach((b) => { b.style.display = b.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    });
    box.querySelectorAll('.kind').forEach((b) => b.addEventListener('click', () => {
      const size = { w: 2.6, d: 2, h: 1 };
      const at = freeSpot(size.w, size.d);
      if (!at) { toast('На плате нет места — снимите или передвиньте детали'); return; }
      const kind = b.dataset.k;
      openModal(`<div class="mh"><div><small>${esc(KINDS[kind].label)}</small><h3>Выберите вариант</h3></div><button class="x" data-close>✕</button></div>${variantCards(kind)}`, (b2) => {
        b2.querySelectorAll('[data-close]').forEach((x) => x.addEventListener('click', closeModal));
        b2.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => openPart(placePart(kind, c.dataset.v, at, size))));
      });
    }));
  });
}

// ---------- export / import ----------
function buildSpec(withSecrets) {
  const spec = { project: state.name, template: state.template || null, format: 'qantcore.ai-engineer/v1', created: new Date().toISOString(),
    generator: { name: 'Qantcore AI Engineer', url: 'https://qantcore.space/ai-engineer/', original: true }, boards: {} };
  for (const b of BOARDS) {
    const bs = state.boards[b.id];
    spec.boards[b.id] = {
      title: b.title,
      parts: bs.parts.map((p) => {
        const v = variantOf(p), config = {}, secrets = {};
        for (const f of v.fields) {
          const val = p.values[f.k];
          if (f.t === 'secret') secrets[f.k] = val ? (withSecrets ? val : '${' + envName(b.id, p, f) + '}') : null;
          else if (val != null && val !== '') config[f.k] = val;
        }
        return { id: p.uid, kind: p.kind, variant: p.variant, name: v.name, position: { x: p.x, z: p.z }, config, secrets, ready: partStatus(p).ok };
      }),
      links: bs.links,
      emptySlots: bs.slots.map((s) => ({ kind: s.kind, label: s.label })),
    };
  }
  return spec;
}
const envName = (bid, p, f) => `${bid}_${p.uid}_${f.k}`.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
function buildEnv() {
  const lines = [`# ${state.name} — секреты агентской системы (qantcore.space/ai-engineer)`];
  for (const b of BOARDS) for (const p of state.boards[b.id].parts) for (const f of variantOf(p).fields) if (f.t === 'secret') lines.push(`${envName(b.id, p, f)}=${p.values[f.k] || ''}`);
  return lines.join('\n') + '\n';
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const slug = () => state.name.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-|-$/g, '') || 'ai-engineer';

// Что реально исполняет python-рантайм из zip — остальное остаётся в agent.json на будущее.
const RUNTIME_EXEC = (p) => {
  switch (p.kind) {
    case 'llm': return p.variant !== 'gigachat';
    case 'prompt': case 'params': return p.variant === 'system' || p.variant === 'sampling';
    case 'buffer': case 'gateway': case 'webchat': case 'telegram':
    case 'guardrails': case 'approval': case 'planner': return true;
    case 'kb': return p.variant === 'files';
    case 'search': return ['tavily', 'brave'].includes(p.variant);
    case 'browser': return true;
    case 'http': return p.variant === 'rest';
    case 'webhook': return p.variant === 'in';
    default: return false;
  }
};
function buildEnvExample() {
  const lines = [`# ${state.name} — секреты агентской системы (qantcore.space/ai-engineer)`];
  for (const b of BOARDS) for (const p of state.boards[b.id].parts) for (const f of variantOf(p).fields) if (f.t === 'secret') lines.push(`${envName(b.id, p, f)}=`);
  lines.push('PORT=8000');
  return lines.join('\n') + '\n';
}
function buildReadme() {
  const exec = [], cfgOnly = [];
  for (const b of BOARDS) for (const p of state.boards[b.id].parts) {
    const v = variantOf(p);
    const line = `${KINDS[p.kind].label} · ${v.name}${p.kind === 'llm' && p.variant === 'yandexgpt' ? ' (beta)' : ''}`;
    (RUNTIME_EXEC(p) ? exec : cfgOnly).push(line);
  }
  const ep = ['- `POST /api/chat` — `{message, session_id}` → `{reply}`', '- `GET /health`'];
  const gw = state.boards.channels.parts.find((p) => p.kind === 'gateway');
  if (gw) ep.push(`- \`POST ${(gw.values.path || '/api/agent')}\` — шлюз (при заданном accessKey нужен заголовок Authorization: Bearer)`);
  if (state.boards.channels.parts.some((p) => p.kind === 'webchat')) ep.push('- `GET /` — веб-чат');
  const wh = state.boards.channels.parts.find((p) => p.kind === 'webhook' && p.variant === 'in');
  if (wh) ep.push(`- \`POST ${(wh.values.path || '/hooks/agent')}\` — входящий вебхук`);
  if (state.boards.channels.parts.some((p) => p.kind === 'telegram')) ep.push('- Telegram-бот: опрос getUpdates в фоне, при заданном токене');
  const chatKey = gw && gw.values.accessKey && !state.boards.channels.parts.some((p) => p.kind === 'webchat');
  return `# ${state.name}\n\nАгентская система, собранная в AI Инженере (qantcore.space/ai-engineer).\n\n## Состав\n\n${exec.concat(cfgOnly).map((l) => '- ' + l).join('\n') || '- нет деталей'}\n\n## Что исполняется рантаймом\n\n${exec.map((l) => '- ' + l).join('\n') || '- ничего'}\n\nТолько в конфиге (agent.json, на будущие версии):\n\n${cfgOnly.map((l) => '- ' + l).join('\n') || '- ничего'}\n\nБюджет и трейсы Langfuse/LangSmith не исполняются — остаются в конфиге. GigaChat пока не поддерживается.\n\n## Запуск\n\n\`\`\`sh\n# ключи уже в .env (если отметили) — проверьте и запустите:\ndocker compose up -d --build\n# http://localhost:8000\n\`\`\`\n\n## Эндпоинты\n\n${ep.join('\n')}\n\n## Доступ\n\n${chatKey ? '- `POST /api/chat` требует `Authorization: Bearer <accessKey>` (веб-чата нет — API закрыт ключом шлюза).\n' : '- `POST /api/chat` открыт без ключа (веб-чат на `/` публичный).\n'}- Порт агента публичен — открывайте его наружу только при необходимости.\n\n## Хостинг\n\nНужен сервер с публичным адресом? Подойдёт VPS от [REG.RU](https://www.reg.ru/?rlink=reflink-31809933).\n\n---\n\nСобрано в [Qantcore AI Engineer](https://qantcore.space/ai-engineer/) — визуальном конструкторе агентских систем. Первоисточник: https://qantcore.space/ai-engineer/\n`;
}
function openExport() {
  stopDemo();
  openModal(`
    <div class="mh"><div><small>Проект</small><h3>Экспорт и импорт</h3></div><button class="x" data-close>✕</button></div>
    <p class="vd">Схема сохраняется автоматически в этом браузере. Для переноса или запуска на сервере скачайте конфигурацию: <b>JSON</b> описывает все платы, детали и связи, <b>.env</b> — ключи отдельным файлом.</p>
    <label class="chk"><input type="checkbox" id="withSec"> Включить ключи прямо в JSON (не рекомендуется)</label>
    <label class="chk"><input type="checkbox" id="zipSec" checked> Положить введённые ключи в .env внутри zip</label>
    <p class="note" style="margin-top:10px">📦 zip — запускаемый python-проект (docker compose). Исполняется: llm (кроме GigaChat), промпт, параметры, буфер, файловая база знаний, tavily/brave, fetch_url, REST API, шлюз, веб-чат, входящий вебхук, telegram, политики, подтверждение, лимит шагов. Остальные детали остаются в agent.json на будущее.</p>
    <div class="ma"><button class="btn" id="impBtn" type="button">⬆ Импорт JSON</button><button class="btn danger" id="resetBtn" type="button">Сбросить всё</button><span></span><button class="btn" id="envBtn" type="button">⬇ .env</button><button class="btn" id="jsonBtn" type="button">⬇ JSON</button><button class="btn primary" id="zipBtn" type="button">📦 Скачать готового агента (.zip)</button></div>
    <input type="file" id="impFile" accept=".json,application/json" hidden>`, (box) => {
    box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    box.querySelector('#jsonBtn').addEventListener('click', () => download(slug() + '.agent.json', JSON.stringify(buildSpec(box.querySelector('#withSec').checked), null, 2), 'application/json'));
    box.querySelector('#zipBtn').addEventListener('click', async () => {
      const btn = box.querySelector('#zipBtn');
      btn.disabled = true;
      try {
        const files = await buildProject({
          spec: buildSpec(false),
          env: box.querySelector('#zipSec').checked ? buildEnv() + 'PORT=8000\n' : null,
          envExample: buildEnvExample(),
          readme: buildReadme(),
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([zipStore(files)], { type: 'application/zip' }));
        a.download = slug() + '-agent.zip'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast('Проект собран — распакуйте и docker compose up');
      } catch (err) { toast('Не удалось собрать zip: ' + err.message); }
      btn.disabled = false;
    });
    box.querySelector('#envBtn').addEventListener('click', () => download(slug() + '.env', buildEnv(), 'text/plain'));
    box.querySelector('#resetBtn').addEventListener('click', () => { if (confirm('Сбросить проект к исходной схеме? Ключи будут удалены.')) { state = initState(); save(); closeModal(); enter('system'); } });
    box.querySelector('#impBtn').addEventListener('click', () => box.querySelector('#impFile').click());
    box.querySelector('#impFile').addEventListener('change', async (e) => {
      try { importSpec(JSON.parse(await e.target.files[0].text())); closeModal(); enter('system'); toast('Проект импортирован'); }
      catch (err) { toast('Не удалось импортировать: ' + err.message); }
    });
  });
}
function importSpec(spec) {
  if (spec.format !== 'qantcore.ai-engineer/v1' || !spec.boards) throw new Error('неизвестный формат');
  const next = initState();
  next.name = String(spec.project || 'AI Инженер').slice(0, 60);
  for (const b of BOARDS) {
    const sb = spec.boards[b.id]; if (!sb) continue;
    const bs = next.boards[b.id];
    const byId = Object.fromEntries(bs.parts.map((p) => [p.uid, p]));
    bs.parts = sb.parts.filter((p) => KINDS[p.kind]).map((p) => {
      const base = byId[p.id] || { w: 2.6, d: 2, h: 1 };
      const values = { ...p.config };
      for (const [k, v] of Object.entries(p.secrets || {})) if (v && !String(v).startsWith('${')) values[k] = v;
      return { uid: p.id, id: p.id, kind: p.kind, variant: p.variant, x: p.position?.x ?? base.x ?? 0, z: p.position?.z ?? base.z ?? 0, w: base.w, d: base.d, h: base.h, values };
    });
    bs.links = (sb.links || []).filter(([a, c]) => bs.parts.some((p) => p.uid === a) && bs.parts.some((p) => p.uid === c));
    bs.slots = bs.slots.filter((s) => !bs.parts.some((p) => Math.abs(p.x - s.x) < (p.w + s.w) / 2 && Math.abs(p.z - s.z) < (p.d + s.d) / 2));
    next.seq += bs.parts.length + 1;
  }
  state = next; save();
}

// ---------- controls / keys ----------
$('#demoBtn').addEventListener('click', startDemo);
$('#addBtn').addEventListener('click', openAdd);
$('#isoBtn').addEventListener('click', () => { const s = view === 'system' ? SYSTEM.size : boardDef(view).size; fitCamera(s[0], s[1]); });
$('#expBtn').addEventListener('click', openExport);
$('#tplBtn').addEventListener('click', openTemplates);
$('#costBtn').addEventListener('click', openCost);
$('#runBtn').addEventListener('click', () => toggleRun());
$('#runX').addEventListener('click', () => toggleRun(false));
$('#runSend').addEventListener('click', runSend);
$('#runReset').addEventListener('click', () => { runHist = []; $('#runLog').innerHTML = ''; });
$('#runText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runSend(); } });
$('#cmpBtn').addEventListener('click', () => openCompose());
$('#spinBtn').addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; $('#spinBtn').classList.toggle('on', controls.autoRotate); });
$('#themeBtn').addEventListener('click', () => { themeName = themeName === 'light' ? 'dark' : 'light'; T = THEMES[themeName]; localStorage.setItem(STORE + ':theme', themeName); build(); });
addEventListener('keydown', (e) => {
  if (e.target.closest('input,textarea,select')) { if (e.key === 'Escape') closeModal(); return; }
  if (e.key === 'Escape') { if (modal.classList.contains('open')) closeModal(); else if (view !== 'system') enter('system'); return; }
  if (modal.classList.contains('open') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const b = BOARDS.find((x) => x.key === k);
  const act = k === '0' ? () => enter('system')
    : b ? () => enter(b.id)
    : (k === 'd' || k === 'в') ? startDemo
    : (k === 'i' || k === 'ш') ? () => $('#isoBtn').click()
    : (k === 'm' || k === 'ь') ? openAdd
    : (k === 'p' || k === 'з') ? openTemplates
    : (k === 'c' || k === 'с') ? openCost
    : (k === 'n' || k === 'т') ? () => openCompose()
    : (k === 'r' || k === 'к') ? toggleRun
    : (k === 't' || k === 'е') ? () => $('#themeBtn').click()
    : null;
  if (act) { e.preventDefault(); act(); }
});

// ---------- loop ----------
function loop(now) {
  controls.update();
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i], t = (now - p.t0) / p.dur;
    if (t >= 1) { root.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); pulses.splice(i, 1); continue; }
    p.m.position.copy(p.curve.getPoint(p.reverse ? 1 - t : t));
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
const start = location.hash.slice(1);
view = BOARDS.some((b) => b.id === start) ? start : 'system';
build();
const s0 = view === 'system' ? SYSTEM.size : boardDef(view).size;
fitCamera(s0[0], s0[1]);
requestAnimationFrame(loop);
if (firstVisit && !location.hash) openTemplates();
window.__aiEngineer = { state: () => state, enter, openPart, openSlot, startDemo, openTemplates };
