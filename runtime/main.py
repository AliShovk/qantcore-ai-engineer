"""Точка входа агента: загружает agent.json, поднимает FastAPI и каналы."""
import asyncio
import html
import json
import logging
import os
import re
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse

from . import llm, tools as tools_mod

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('agent')

ROOT = Path(__file__).resolve().parent.parent


class LLMCallError(RuntimeError):
    """Ошибка вызова LLM — возвращается каналам как 502 / текст ошибки."""


def load_config(path=ROOT / 'agent.json'):
    raw = Path(path).read_text(encoding='utf-8')
    return json.loads(re.sub(r'\$\{([A-Z0-9_]+)\}', lambda m: os.environ.get(m.group(1), ''), raw))


def all_parts(spec):
    out = []
    for board in (spec.get('boards') or {}).values():
        out.extend(board.get('parts') or [])
    return out


def find_part(parts, kind, variant=None):
    return next((p for p in parts if p.get('kind') == kind and (variant is None or p.get('variant') == variant)), None)


def _lines(v):
    return [x.strip() for x in str(v or '').splitlines() if x.strip()]


def _contains(hay, needles):
    low = str(hay).lower()
    return any(n.lower() in low for n in needles)


def build_agent(spec):
    parts = all_parts(spec)
    llm_part = find_part(parts, 'llm')
    if not llm_part:
        raise RuntimeError('В agent.json нет детали llm')
    if llm_part.get('variant') == 'gigachat':
        raise llm.LLMError('GigaChat пока не поддерживается рантаймом — выберите другой провайдер')

    prompt = find_part(parts, 'prompt', 'system')
    system = ''
    if prompt:
        c = prompt.get('config') or {}
        system = (c.get('role', '') + '\n' + c.get('rules', '')).strip()

    params_part = find_part(parts, 'params', 'sampling')
    params = (params_part.get('config') if params_part else {}) or {}
    if 'temperature' in params:
        params = {**params, 'temperature': float(params['temperature'])}
    if 'maxTokens' in params:
        params = {**params, 'maxTokens': int(params['maxTokens'])}

    planner = find_part(parts, 'planner')
    max_steps = min(int(((planner or {}).get('config') or {}).get('maxSteps') or 8), 25)

    buffer = find_part(parts, 'buffer')
    hist_size = int(((buffer or {}).get('config') or {}).get('size') or 20)

    guard = find_part(parts, 'guardrails')
    deny = _lines(((guard or {}).get('config') or {}).get('deny'))

    approval = find_part(parts, 'approval')
    actions = _lines(((approval or {}).get('config') or {}).get('actions'))

    tools = tools_mod.build_tools(parts, None)
    by_name = {t['name']: t for t in tools}
    exposed = [{k: t[k] for k in ('name', 'description', 'parameters')} for t in tools]
    sessions = {}

    def run_tool(name, args):
        if actions and (_contains(name, actions) or _contains(json.dumps(args, ensure_ascii=False), actions)):
            return 'нужно подтверждение человека'
        if deny and _contains(json.dumps(args, ensure_ascii=False), deny):
            return 'Запрос заблокирован политикой'
        t = by_name.get(name)
        if not t:
            return f'неизвестный инструмент: {name}'
        try:
            return str(t['run'](args or {}))
        except Exception as e:
            return f'ошибка инструмента: {e}'

    async def ask(message, session_id='default'):
        if deny and _contains(message, deny):
            return 'Запрос заблокирован политикой'
        hist = sessions.setdefault(session_id, [])
        hist.append({'role': 'user', 'content': message})
        msgs = ([{'role': 'system', 'content': system}] if system else []) + hist
        reply = ''
        for _ in range(max_steps):
            try:
                r = await asyncio.to_thread(llm.chat, llm_part, params, msgs, exposed)
            except Exception as e:
                if isinstance(e, httpx.HTTPStatusError):
                    detail = f'{e.response.status_code} {e.response.text[:300]}'
                else:
                    detail = str(e)
                log.error('LLM call failed: %s', detail)
                raise LLMCallError(f'LLM: {detail}')
            if not r.get('tool_calls'):
                reply = r.get('content') or ''
                break
            msgs.append({'role': 'assistant', 'content': r.get('content'), 'tool_calls': r['tool_calls']})
            for tc in r['tool_calls']:
                log.info('tool %s %s', tc.get('name'), json.dumps(tc.get('args'), ensure_ascii=False)[:300])
                result = await asyncio.to_thread(run_tool, tc.get('name', ''), tc.get('args'))
                msgs.append({'role': 'tool', 'tool_call_id': tc.get('id', ''), 'name': tc.get('name', ''), 'content': result})
        else:
            reply = 'Не удалось завершить задачу за отведённое число шагов.'
        hist.append({'role': 'assistant', 'content': reply})
        del hist[:-hist_size * 2]
        return reply

    return ask, parts


async def chat_json(ask, req):
    body = await req.json()
    try:
        return {'reply': await ask(body.get('message', ''), body.get('session_id', 'default'))}
    except LLMCallError as e:
        return JSONResponse({'error': str(e)}, status_code=502)


def create_app(spec=None):
    spec = spec or load_config()
    ask, parts = build_agent(spec)
    app = FastAPI(title=spec.get('project', 'agent'))

    gateway = find_part(parts, 'gateway', 'api')
    webchat = find_part(parts, 'webchat')
    # /api/chat публичен, когда есть веб-чат; иначе — та же авторизация, что у шлюза
    chat_key = ((gateway or {}).get('secrets') or {}).get('accessKey', '') if gateway and not webchat else ''

    @app.post('/api/chat')
    async def api_chat(req: Request):
        if chat_key and req.headers.get('authorization') != f'Bearer {chat_key}':
            return JSONResponse({'error': 'unauthorized'}, status_code=401)
        return await chat_json(ask, req)

    @app.get('/health')
    async def health():
        return {'ok': True}

    if gateway:
        gpath = (gateway.get('config') or {}).get('path') or '/api/agent'
        if gpath != '/api/chat':
            @app.post(gpath)
            async def gateway_chat(req: Request):
                key = (gateway.get('secrets') or {}).get('accessKey', '')
                if key and req.headers.get('authorization') != f'Bearer {key}':
                    return JSONResponse({'error': 'unauthorized'}, status_code=401)
                return await chat_json(ask, req)

    if webchat:
        greeting = ((webchat.get('config') or {}).get('greeting') or 'Здравствуйте!')

        @app.get('/', response_class=HTMLResponse)
        async def page():
            return f'''<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(spec.get('project', 'Агент'))}</title>
<style>body{{font-family:monospace;max-width:640px;margin:24px auto;padding:0 12px}}#log div{{margin:6px 0;padding:8px 10px;border-radius:6px}}.u{{background:#eee}}.a{{background:#dff0ff}}form{{display:flex;gap:8px;margin-top:12px}}input{{flex:1;padding:8px;font:inherit}}button{{padding:8px 16px;font:inherit;cursor:pointer}}</style></head>
<body><h3>{html.escape(spec.get('project', 'Агент'))}</h3><div id="log"><div class="a">{html.escape(greeting)}</div></div>
<form id="f"><input id="m" autocomplete="off" autofocus placeholder="Сообщение…"><button>→</button></form>
<script>const log=document.getElementById('log'),sid=Math.random().toString(36).slice(2);
document.getElementById('f').onsubmit=async e=>{{e.preventDefault();const i=document.getElementById('m'),t=i.value.trim();if(!t)return;
log.insertAdjacentHTML('beforeend','<div class="u">'+t.replace(/</g,'&lt;')+'</div>');i.value='';
const r=await fetch('/api/chat',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{message:t,session_id:sid}})}});
const d=await r.json();log.insertAdjacentHTML('beforeend','<div class="a">'+(d.reply||'…').replace(/</g,'&lt;')+'</div>');}};</script></body></html>'''

    webhook = find_part(parts, 'webhook', 'in')
    if webhook:
        wpath = (webhook.get('config') or {}).get('path') or '/hooks/agent'

        @app.post(wpath)
        async def hook(req: Request):
            secret = (webhook.get('secrets') or {}).get('secret', '')
            if secret and req.headers.get('x-webhook-secret') != secret:
                return JSONResponse({'error': 'unauthorized'}, status_code=401)
            body = await req.json()
            text = body.get('text') if isinstance(body, dict) else None
            try:
                return {'reply': await ask(text or json.dumps(body, ensure_ascii=False), 'webhook')}
            except LLMCallError as e:
                return JSONResponse({'error': str(e)}, status_code=502)

    tg = find_part(parts, 'telegram', 'bot')
    if tg and (tg.get('secrets') or {}).get('token'):
        token = tg['secrets']['token']
        allowed = {x.strip().lstrip('@').lower() for x in str((tg.get('config') or {}).get('allowed') or '').split(',') if x.strip()}
        tapi = f'https://api.telegram.org/bot{token}'

        async def tg_loop():
            offset = 0
            async with httpx.AsyncClient(timeout=45) as client:
                while True:
                    try:
                        r = await client.get(tapi + '/getUpdates', params={'offset': offset, 'timeout': 30})
                        for u in r.json().get('result', []):
                            offset = u['update_id'] + 1
                            msg = u.get('message') or {}
                            text, chat_id = msg.get('text'), (msg.get('chat') or {}).get('id')
                            user = (msg.get('from') or {})
                            if not text or chat_id is None:
                                continue
                            if allowed and str(user.get('id')) not in allowed and str(user.get('username', '')).lower() not in allowed:
                                continue
                            try:
                                reply = await ask(text, f'tg:{chat_id}')
                            except LLMCallError as e:
                                reply = f'Ошибка {e}'
                            await client.post(tapi + '/sendMessage', json={'chat_id': chat_id, 'text': reply})
                    except Exception as e:
                        log.warning('telegram: %s', e)
                        await asyncio.sleep(5)

        @app.on_event('startup')
        async def _tg():
            asyncio.create_task(tg_loop())

    return app


def main():
    import uvicorn
    uvicorn.run(create_app(), host='0.0.0.0', port=int(os.environ.get('PORT', 8000)))


if __name__ == '__main__':
    main()
