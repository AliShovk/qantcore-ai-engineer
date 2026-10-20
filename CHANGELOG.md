# Changelog

## 1.1.0 — 2026-10-20

- Unit tests: 31 for the app (`node --test`) and 12 for the runtime (`unittest`), both wired into CI.
- README: hero screenshot, architecture diagram, four screenshots, tests section, badges.
- CI: runs the test suites and the runtime import check, not just syntax.

## 1.0.0 — 2026-10-19

First public snapshot of the builder that runs at https://qantcore.space/ai-engineer/.

- Six boards (channels, control, orchestrator, LLM core, memory, tools) with 100+ configurable parts.
- Templates: full system, Telegram support bot, RAG over documents, web researcher, AI developer.
- Assembly from a plain-language description.
- Live run in the browser with your own keys (no backend, nothing stored server-side).
- Cost estimate from token prices and topology.
- Export to a runnable project: `agent.json`, FastAPI runtime, Dockerfile, docker-compose, `.env.example`, `knowledge/`.
- Origin markers: `data-origin`, footer link, per-file banners, `ORIGIN.txt` and `generator` block in every export.
- Apache-2.0 license, trademark and content exclusions in `NOTICE`.
