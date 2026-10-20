# Contributing

Thanks for looking at this project. It is small on purpose: plain ES modules, no framework, no build step, no backend.

## Run it locally

```bash
python3 -m http.server 8080
# http://localhost:8080/
```

The page must be served over HTTP — ES modules do not load from `file://`.

## Tests

```bash
node --test test-ai-engineer.mjs          # 31 tests
python3 -m unittest runtime.test_runtime  # 12 tests (needs fastapi, httpx)
```

Run both before opening a pull request. CI runs them on every push.

## What is welcome

- Bug reports with a reproduce path (browser, steps, expected/actual).
- New parts for `boards.js` (a channel, a tool, an LLM provider) — include the fields and a sensible default.
- Fixes to the exported runtime (`runtime/`): it must stay dependency-light and run with `docker compose up`.
- Accessibility and keyboard-navigation improvements.
- Translations.

## Rules

1. **Do not break the export.** After changing `app.js`, `exporter.js` or `runtime/`, build a ZIP in the UI and check that it still runs.
2. **Keep the origin markers.** `data-origin`, the footer link and the banner comments identify the original project. Removing them is not a contribution.
3. **Never commit keys.** `.env`, tokens and any credentials are ignored by `.gitignore`; keep it that way.
4. **One change per PR**, with a short explanation of what and why.
5. Match the existing style: 2-space indent, single quotes, no dependencies without a strong reason.

## Security

If you find a vulnerability (for example, a way to exfiltrate keys typed into the builder), please do not open a public issue — write to the address in the repository profile first.

## License

By contributing you agree that your contribution is licensed under Apache-2.0, the license of this repository.
