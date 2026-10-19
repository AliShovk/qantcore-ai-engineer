"""Инструменты агента: web_search, fetch_url, call_api, search_knowledge."""
import ipaddress
import json
import os
import re
import socket
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent / 'knowledge'


def _tavily(query, key):
    r = httpx.post('https://api.tavily.com/search', headers={'Authorization': f'Bearer {key}'},
                   json={'query': query, 'max_results': 5}, timeout=60)
    r.raise_for_status()
    return [{'title': x.get('title', ''), 'url': x.get('url', ''), 'snippet': x.get('content', '')} for x in r.json().get('results', [])]


def _brave(query, key):
    r = httpx.get('https://api.search.brave.com/res/v1/web/search', params={'q': query},
                  headers={'X-Subscription-Token': key}, timeout=60)
    r.raise_for_status()
    return [{'title': x.get('title', ''), 'url': x.get('url', ''), 'snippet': x.get('description', '')} for x in (r.json().get('web') or {}).get('results', [])]


def _public_url(url):
    """Пропускает только http(s) URL с публичным хостом. Возвращает url или кидает ValueError."""
    if not re.match(r'^https?://', url or '', re.I):
        raise ValueError('разрешены только http(s) ссылки')
    host = urlsplit(url).hostname
    if not host:
        raise ValueError('не удалось разрешить хост')
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise ValueError('не удалось разрешить хост')
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            raise ValueError('адрес в приватной или служебной сети запрещён')
    return url


def _fetch_url(url, max_hops=5):
    for _ in range(max_hops + 1):
        url = _public_url(url)
        r = httpx.get(url, timeout=30, follow_redirects=False)
        if r.is_redirect and r.headers.get('location'):
            url = urljoin(url, r.headers['location'])
            continue
        r.raise_for_status()
        text = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', r.text, flags=re.S | re.I)
        text = re.sub(r'<[^>]+>', ' ', text)
        return re.sub(r'\s+', ' ', text).strip()[:8000]
    raise ValueError('слишком много редиректов')


def _sanitize(name):
    return re.sub(r'[^a-zA-Z0-9_]', '_', name or 'call_api')


def _search_knowledge(query, chunk_size):
    if not KNOWLEDGE_DIR.is_dir():
        return 'база знаний пуста (папка knowledge/ не найдена)'
    words = [w.lower() for w in re.findall(r'\w+', query) if len(w) > 1]
    if not words:
        return 'пустой запрос'
    scored = []
    for path in sorted(KNOWLEDGE_DIR.rglob('*')):
        if path.suffix.lower() not in ('.md', '.txt') or not path.is_file():
            continue
        try:
            text = path.read_text(encoding='utf-8', errors='replace')
        except OSError:
            continue
        for i in range(0, len(text), chunk_size):
            chunk = text[i:i + chunk_size]
            low = chunk.lower()
            score = sum(low.count(w) for w in words)
            if score:
                scored.append((score, path.name, chunk))
    scored.sort(key=lambda x: -x[0])
    if not scored:
        return 'ничего не найдено в базе знаний'
    return '\n\n'.join(f'### {name}\n{chunk.strip()}' for _, name, chunk in scored[:4])


def build_tools(parts, find_secret):
    """parts — список деталей {kind, variant, config, secrets}. Возвращает [{name, description, parameters, run}]."""
    tools = []

    search = next((p for p in parts if p['kind'] == 'search'), None)
    if search:
        key = (search.get('secrets') or {}).get('apiKey', '')
        if search['variant'] == 'tavily' and key:
            tools.append({
                'name': 'web_search', 'description': 'Поиск в интернете. Возвращает заголовки, ссылки и сниппеты.',
                'parameters': {'type': 'object', 'properties': {'query': {'type': 'string'}}, 'required': ['query']},
                'run': lambda a: json.dumps(_tavily(a.get('query', ''), key), ensure_ascii=False),
            })
        elif search['variant'] == 'brave' and key:
            tools.append({
                'name': 'web_search', 'description': 'Поиск в интернете. Возвращает заголовки, ссылки и сниппеты.',
                'parameters': {'type': 'object', 'properties': {'query': {'type': 'string'}}, 'required': ['query']},
                'run': lambda a: json.dumps(_brave(a.get('query', ''), key), ensure_ascii=False),
            })

    if any(p['kind'] == 'browser' for p in parts):
        tools.append({
            'name': 'fetch_url', 'description': 'Скачивает веб-страницу и возвращает её текст (до 8000 символов).',
            'parameters': {'type': 'object', 'properties': {'url': {'type': 'string'}}, 'required': ['url']},
            'run': lambda a: _fetch_url(a.get('url', '')),
        })

    http = next((p for p in parts if p['kind'] == 'http' and p['variant'] == 'rest'), None)
    if http and (http.get('config') or {}).get('url'):
        cfg, sec = http['config'], http.get('secrets') or {}
        base, auth = cfg['url'].rstrip('/'), (cfg.get('authHeader') or '').strip()

        def run_api(a, base=base, cfg=cfg, auth=auth, key=sec.get('apiKey', '')):
            method = (a.get('method') or cfg.get('method') or 'GET').upper()
            path = a.get('path', '')
            url = path if re.match(r'^https?://', path or '', re.I) else base + '/' + str(path).lstrip('/')
            headers = {}
            if auth:
                headers[auth.split(':')[0].strip()] = (auth.split(':', 1)[1].strip() + ' ' + key).strip() if ':' in auth else key
            r = httpx.request(method, url, headers=headers, json=a.get('body') if method != 'GET' else None, timeout=60)
            return r.text[:8000]

        tools.append({
            'name': _sanitize(cfg.get('name')), 'description': f"Вызов внешнего API {base}. Возвращает тело ответа.",
            'parameters': {'type': 'object', 'properties': {'path': {'type': 'string'}, 'method': {'type': 'string'}, 'body': {'type': 'object'}}, 'required': ['path']},
            'run': run_api,
        })

    kb = next((p for p in parts if p['kind'] == 'kb' and p['variant'] == 'files'), None)
    if kb:
        chunk = int((kb.get('config') or {}).get('chunk') or 800)
        tools.append({
            'name': 'search_knowledge', 'description': 'Поиск по базе знаний (файлы в knowledge/).',
            'parameters': {'type': 'object', 'properties': {'query': {'type': 'string'}}, 'required': ['query']},
            'run': lambda a: _search_knowledge(a.get('query', ''), chunk),
        })

    return tools
