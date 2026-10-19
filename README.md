# Qantcore AI Engineer

**A visual builder for AI agent systems.** Assemble an agent on boards — channels, control, orchestrator, LLM core, memory, tools — plug in your own API keys, and export a **runnable project** (FastAPI + Docker) as a ZIP. No backend, no build step, no accounts.

- **Live demo:** https://qantcore.space/ai-engineer/
- **License:** Apache-2.0 (see [LICENSE](LICENSE) and [NOTICE](NOTICE))
- **Original source:** https://github.com/AliShovk/qantcore-ai-engineer

![Qantcore AI Engineer](docs/screenshot.png)

---

## What it does

1. **Six boards** — channels, control, orchestrator, LLM core, memory, tools. Every board holds parts; every part is configurable with a click.
2. **Templates** — ready configurations (support bot, RAG over documents, web researcher, AI developer). Or describe the agent in plain words and let it be assembled.
3. **Live run and demo run** — talk to the assembled agent right in the browser. Keys are sent **from your browser directly to the provider**; Qantcore never sees them and stores nothing server-side.
4. **Cost estimate** — rough monthly cost from token prices and the number of LLM calls in the topology.
5. **Export** — a ZIP with `agent.json`, a Python runtime, `Dockerfile`, `docker-compose.yml`, `.env.example` and `knowledge/`. Unpack, `docker compose up`, and you have a working agent.

## Quick start

The app is a static site with ES modules, so it must be served over HTTP (opening `index.html` via `file://` will not work):

```bash
git clone https://github.com/AliShovk/qantcore-ai-engineer.git
cd qantcore-ai-engineer
python3 -m http.server 8080
# open http://localhost:8080/
```

No dependencies, no install step. A browser with WebGL is enough.

## What the exported project contains

```
agent.json          # the whole configuration: boards, parts, links, secrets references
runtime/            # FastAPI runtime: main.py, llm.py, tools.py
Dockerfile
docker-compose.yml
requirements.txt
.env / .env.example # secrets, either inline or as placeholders
knowledge/          # put .md/.txt files here for RAG
ORIGIN.txt          # origin and export time
README.md           # generated project README
```

The runtime executes the channels (web chat, Telegram, incoming webhook, generic gateway), the LLM core and the tools it supports. Some parts exist only in `agent.json` as configuration for future versions — the exported README always lists which parts are executed and which are config-only.

## Project structure

```
index.html            # the shell: styles, import map, boards
app.js                # UI, boards, modals, export/import
boards.js             # catalogue of parts and their fields
model.js              # state, templates, defaults
compose.js            # "describe the agent in words" → configuration
cost.js, prices.js    # token prices and cost estimate
runner.js             # live run against provider APIs
exporter.js           # ZIP builder and project generator
runtime/              # Python runtime shipped with every export
vendor/               # three.js and OrbitControls (MIT)
```

## Security model

- API keys are typed by you in the browser and go straight to the provider's endpoint (`api.openai.com`, `api.anthropic.com`, compatible gateways, etc.).
- The app has no backend: nothing is uploaded, nothing is logged server-side.
- The configuration itself is stored in your browser's `localStorage` only.
- Export can embed keys into `.env` — that option is off by default and clearly marked as not recommended.

## Status and scope

This is the builder, not a hosted service. It does not include the Qantcore catalogue, reviews or editorial content — see the note in [NOTICE](NOTICE).

Known limitations: GigaChat is not supported; budget and Langfuse/LangSmith tracing parts are configuration-only.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Two rules matter most: do not break the exported runtime, and do not remove the origin markers (they are how copies are told apart from the original).

---

## По-русски

Визуальный конструктор агентских систем: собираете агента на платах (каналы, контроль, оркестратор, ядро LLM, память, инструменты), вводите свои API-ключи и выгружаете **готовый к запуску проект** — ZIP с `agent.json`, Python-рантаймом, Dockerfile и `docker-compose.yml`.

Ключи вводятся в браузере и уходят провайдеру напрямую; на сервере ничего не хранится. Запуск локально: `python3 -m http.server 8080` в папке проекта, открыть `http://localhost:8080/`.

Оригинал: https://qantcore.space/ai-engineer/ · Лицензия: Apache-2.0 · Название и логотип «Qantcore» лицензией не покрываются.
