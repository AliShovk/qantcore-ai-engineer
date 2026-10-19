/*! Qantcore AI Engineer — первоисточник: https://qantcore.space/ai-engineer/
 *  (c) 2026 Qantcore. Если этот файл открыт на другом домене — перед вами копия.
 *  Оригинал, история и лицензия: см. ссылку выше. */
// Сборка zip-проекта «готовый агент»: файлы + минимальный ZIP-писатель (STORE + CRC32, UTF-8).
// Нулевая зависимость от three/boards — можно тестировать в node.

const RUNTIME_FILES = ['runtime/__init__.py', 'runtime/main.py', 'runtime/llm.py', 'runtime/tools.py'];
const RUNTIME_V = 2;

const enc = new TextEncoder();
const bytes = (s) => (typeof s === 'string' ? enc.encode(s) : s);

// --- CRC32 ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(data) {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{name, data: string|Uint8Array}] → Uint8Array (STORE, UTF-8 flag bit 11)
export function zipStore(files) {
  const chunks = [], central = [];
  let offset = 0;
  const u16 = (v) => [v & 0xff, (v >> 8) & 0xff], u32 = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff];
  for (const f of files) {
    const name = enc.encode(f.name), data = bytes(f.data), crc = crc32(data);
    const head = [
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0),
    ];
    chunks.push(new Uint8Array(head), name, data);
    central.push([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length),
      ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
      ...name,
    ]);
    offset += head.length + name.length + data.length;
  }
  const cd = central.map((c) => new Uint8Array(c));
  const cdSize = cd.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(cdSize), ...u32(offset), ...u16(0),
  ]);
  const out = new Uint8Array(offset + cdSize + end.length);
  let pos = 0;
  for (const c of [...chunks, ...cd, end]) { out.set(c, pos); pos += c.length; }
  return out;
}

const COMPOSE = `services:
  agent:
    build: .
    env_file: [.env]
    ports: ["\${PORT:-8000}:8000"]
    volumes: ["./knowledge:/app/knowledge:ro"]
    restart: unless-stopped
`;

const DOCKERFILE = `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python","-m","runtime.main"]
`;

const REQUIREMENTS = `fastapi==0.115.*
uvicorn==0.32.*
httpx==0.27.*
`;

const KNOWLEDGE_README = `Положите сюда .md/.txt файлы — агент будет отвечать по ним.
Инструмент search_knowledge подбирает релевантные куски по ключевым словам запроса.
`;

const DOCKERIGNORE = `.env
.git
__pycache__
`;

const GITIGNORE = `.env
`;

// .env в zip всегда: с ключами, если отмечено, иначе пустой шаблон —
// чтобы docker compose up не падал на отсутствующем env_file.
export function envFileContent({ withSecrets, env, envExample }) {
  return withSecrets ? env : envExample;
}

async function fetchRuntime() {
  const files = [];
  for (const name of RUNTIME_FILES) {
    const r = await fetch(`${name}?v=${RUNTIME_V}`);
    if (!r.ok) throw new Error(`runtime fetch ${name}: ${r.status}`);
    files.push({ name, data: await r.text() });
  }
  return files;
}

// -> [{name, data}] — полный список файлов zip
export async function buildProject({ spec, env, envExample, readme }) {
  const files = [
    { name: 'agent.json', data: JSON.stringify(spec, null, 2) + '\n' },
    { name: '.env.example', data: envExample },
    { name: 'docker-compose.yml', data: COMPOSE },
    { name: 'Dockerfile', data: DOCKERFILE },
    { name: 'requirements.txt', data: REQUIREMENTS },
    { name: 'knowledge/README.md', data: KNOWLEDGE_README },
    { name: '.dockerignore', data: DOCKERIGNORE },
    { name: '.gitignore', data: GITIGNORE },
    { name: 'README.md', data: readme },
    { name: '.env', data: envFileContent({ withSecrets: env != null, env, envExample }) },
    { name: 'ORIGIN.txt', data: `origin: https://qantcore.space/ai-engineer/\ngenerator: Qantcore AI Engineer (original)\nexported: ${new Date().toISOString()}\n` },
  ];
  files.push(...await fetchRuntime());
  return files;
}
