"""Адаптеры LLM-провайдеров.

Внутренний формат сообщений — OpenAI-совместимый:
  {"role": "system"|"user"|"assistant"|"tool", "content": str|None,
   "tool_calls": [{"id", "name", "args"}], "tool_call_id": str, "name": str}
chat() возвращает {"content": str|None, "tool_calls": [{"id", "name", "args": dict}]}.
При отправке в OpenAI-совместимый API tool_calls сериализуются в wire-формат
({type: function, function: {name, arguments: json}}) — см. to_openai_messages.
"""
import os

import httpx

TIMEOUT = 120


class LLMError(RuntimeError):
    pass


_OPENAI_BASES = {
    'deepseek': 'https://api.deepseek.com/v1',
    'qwen': 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    'openrouter': 'https://openrouter.ai/api/v1',
    'gemini': 'https://generativelanguage.googleapis.com/v1beta/openai',
}


def _base_url(variant, config):
    override = os.environ.get('LLM_BASE_URL')
    if override:
        return override.rstrip('/')
    if variant == 'ollama':
        return (config.get('baseUrl') or 'http://localhost:11434').rstrip('/') + '/v1'
    if variant == 'openai':
        return (config.get('baseUrl') or 'https://api.openai.com/v1').rstrip('/')
    if variant == 'yandexgpt':
        return 'https://llm.api.cloud.yandex.net/v1'
    return _OPENAI_BASES.get(variant)


def _openai_tools(tools):
    return [{'type': 'function', 'function': {'name': t['name'], 'description': t.get('description', ''), 'parameters': t.get('parameters', {'type': 'object', 'properties': {}})}} for t in tools]


def _parse_openai(data):
    msg = data['choices'][0]['message']
    calls = []
    for tc in msg.get('tool_calls') or []:
        fn = tc.get('function') or {}
        try:
            args = json_loads(fn.get('arguments') or '{}')
        except Exception:
            args = {}
        calls.append({'id': tc.get('id', 'call_' + str(len(calls))), 'name': fn.get('name', ''), 'args': args})
    return {'content': msg.get('content'), 'tool_calls': calls}


def json_loads(s):
    import json
    return json.loads(s)


def to_openai_messages(messages):
    """Внутренний формат → wire-формат OpenAI (tool_calls/function arguments)."""
    import json
    out = []
    for m in messages:
        if m.get('role') == 'assistant' and m.get('tool_calls'):
            out.append({'role': 'assistant', 'content': m.get('content'), 'tool_calls': [
                {'id': tc.get('id', ''), 'type': 'function',
                 'function': {'name': tc.get('name', ''), 'arguments': json.dumps(tc.get('args') or {}, ensure_ascii=False)}}
                for tc in m['tool_calls']]})
        elif m.get('role') == 'tool':
            out.append({'role': 'tool', 'tool_call_id': m.get('tool_call_id', ''), 'name': m.get('name', ''), 'content': m.get('content')})
        else:
            out.append({'role': m.get('role'), 'content': m.get('content')})
    return out


def _chat_openai(base, headers, model, messages, tools, params):
    body = {'model': model, 'messages': to_openai_messages(messages), 'temperature': params.get('temperature', 0.3), 'max_tokens': params.get('maxTokens', 4096)}
    if tools:
        body['tools'] = _openai_tools(tools)
    r = httpx.post(base + '/chat/completions', headers=headers, json=body, timeout=TIMEOUT)
    r.raise_for_status()
    return _parse_openai(r.json())


def to_anthropic_messages(messages):
    """OpenAI-формат → (system, messages) для Messages API."""
    system, out = [], []
    for m in messages:
        role, content = m.get('role'), m.get('content')
        if role == 'system':
            system.append(content or '')
        elif role == 'assistant' and m.get('tool_calls'):
            blocks = []
            if content:
                blocks.append({'type': 'text', 'text': content})
            for tc in m['tool_calls']:
                blocks.append({'type': 'tool_use', 'id': tc.get('id', ''), 'name': tc.get('name', ''), 'input': tc.get('args', tc.get('arguments', {})) or {}})
            out.append({'role': 'assistant', 'content': blocks})
        elif role == 'tool':
            block = {'type': 'tool_result', 'tool_use_id': m.get('tool_call_id', ''), 'content': content or ''}
            if out and out[-1]['role'] == 'user' and isinstance(out[-1]['content'], list) and out[-1]['content'] and out[-1]['content'][-1].get('type') == 'tool_result':
                out[-1]['content'].append(block)
            else:
                out.append({'role': 'user', 'content': [block]})
        else:
            if out and out[-1]['role'] == role and isinstance(out[-1]['content'], str):
                out[-1]['content'] += '\n' + (content or '')
            else:
                out.append({'role': role, 'content': content or ''})
    return '\n'.join(system), out


def _to_anthropic_tools(tools):
    return [{'name': t['name'], 'description': t.get('description', ''), 'input_schema': t.get('parameters', {'type': 'object', 'properties': {}})} for t in tools]


def _parse_anthropic(data):
    content, calls = [], []
    for b in data.get('content') or []:
        if b.get('type') == 'text':
            content.append(b.get('text', ''))
        elif b.get('type') == 'tool_use':
            calls.append({'id': b.get('id', ''), 'name': b.get('name', ''), 'args': b.get('input') or {}})
    return {'content': '\n'.join(content) or None, 'tool_calls': calls}


def _chat_anthropic(key, model, messages, tools, params):
    system, conv = to_anthropic_messages(messages)
    body = {'model': model, 'messages': conv, 'max_tokens': params.get('maxTokens', 4096)}
    if system:
        body['system'] = system
    if params.get('temperature') is not None:
        body['temperature'] = params['temperature']
    if tools:
        body['tools'] = _to_anthropic_tools(tools)
    headers = {'x-api-key': key, 'anthropic-version': '2023-06-01'}
    r = httpx.post('https://api.anthropic.com/v1/messages', headers=headers, json=body, timeout=TIMEOUT)
    r.raise_for_status()
    return _parse_anthropic(r.json())


def chat(part, params, messages, tools):
    """part — {variant, config, secrets}; возвращает {content, tool_calls}."""
    variant = part['variant']
    config, secrets = part.get('config') or {}, part.get('secrets') or {}
    if variant == 'gigachat':
        raise LLMError('GigaChat пока не поддерживается рантаймом — выберите другой провайдер')
    if variant == 'anthropic':
        return _chat_anthropic(secrets.get('apiKey', ''), config.get('model', 'claude-sonnet-4-5'), messages, tools, params)
    base = _base_url(variant, config)
    if not base:
        raise LLMError(f'Неизвестный провайдер LLM: {variant}')
    key = secrets.get('apiKey', '')
    headers = {}
    if key:
        headers['Authorization'] = f'Api-Key {key}' if variant == 'yandexgpt' else f'Bearer {key}'
    model = config.get('model', '')
    if variant == 'yandexgpt':
        model = f"gpt://{config.get('folderId', '')}/{model}/latest"
    return _chat_openai(base, headers, model, messages, tools, params)
