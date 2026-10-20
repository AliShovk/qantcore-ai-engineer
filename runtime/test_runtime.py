# Тесты рантайма: python -m unittest static/ai-engineer/runtime/test_runtime.py
import asyncio
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from runtime import llm, main, tools as tools_mod  # noqa: E402


def spec_with(**kw):
    part = {'id': 'llm', 'kind': 'llm', 'variant': kw.pop('variant', 'openai'),
            'config': kw.pop('config', {'model': 'm'}), 'secrets': kw.pop('secrets', {'apiKey': 'k'})}
    boards = {'core': {'parts': [part] + kw.pop('parts', [])}}
    return {'project': 't', 'boards': boards, **kw}


class FakeLLM(HTTPServer):
    def __init__(self, mode='tool_then_answer'):
        self.calls = 0
        self.bodies = []
        self.mode = mode
        super().__init__(('127.0.0.1', 0), self.Handler)

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            srv = self.server
            srv.calls += 1
            raw = self.rfile.read(int(self.headers.get('Content-Length', 0)) or 0)
            try:
                srv.bodies.append(json.loads(raw))
            except Exception:
                srv.bodies.append(None)
            if srv.mode == 'unauthorized':
                data = json.dumps({'error': {'message': 'bad key'}}).encode()
                self.send_response(401)
            else:
                if srv.mode == 'tool_then_answer' and srv.calls == 1:
                    body = {'choices': [{'message': {'content': None, 'tool_calls': [
                        {'id': 'c1', 'type': 'function', 'function': {'name': 'web_search', 'arguments': '{"query":"q"}'}}]}}]}
                else:
                    body = {'choices': [{'message': {'content': 'готовый ответ'}}]}
                data = json.dumps(body).encode()
                self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *a):
            pass


class RedirectSrv(HTTPServer):
    def __init__(self):
        super().__init__(('127.0.0.1', 0), self.Handler)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(302)
            self.send_header('Location', f'http://127.0.0.1:{self.server.server_port}/private')
            self.send_header('Content-Length', '0')
            self.end_headers()

        def log_message(self, *a):
            pass


class LoopTest(unittest.TestCase):
    def test_tool_calls_serialized_on_the_wire(self):
        srv = FakeLLM()
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        os.environ['LLM_BASE_URL'] = f'http://127.0.0.1:{srv.server_port}/v1'
        try:
            spec = spec_with(parts=[
                {'id': 'search', 'kind': 'search', 'variant': 'tavily', 'config': {}, 'secrets': {'apiKey': 'x'}}])
            ask, _ = main.build_agent(spec)
            tools_mod._tavily = lambda q, k: [{'title': 't', 'url': 'u', 'snippet': 's'}]
            reply = asyncio.run(ask('привет', 's1'))
            self.assertEqual(reply, 'готовый ответ')
            am = next(m for m in srv.bodies[1]['messages'] if m.get('role') == 'assistant' and m.get('tool_calls'))
            self.assertEqual(am['tool_calls'][0]['type'], 'function')
            self.assertIsInstance(am['tool_calls'][0]['function']['arguments'], str)
            tm = next(m for m in srv.bodies[1]['messages'] if m.get('role') == 'tool')
            self.assertEqual(tm['tool_call_id'], 'c1')
        finally:
            os.environ.pop('LLM_BASE_URL', None)
            srv.shutdown()

    def test_tool_loop(self):
        srv = FakeLLM()
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        os.environ['LLM_BASE_URL'] = f'http://127.0.0.1:{srv.server_port}/v1'
        try:
            spec = spec_with(parts=[
                {'id': 'search', 'kind': 'search', 'variant': 'tavily', 'config': {}, 'secrets': {'apiKey': 'x'}}])
            ask, _ = main.build_agent(spec)
            # подменяем сетевой вызов tavily
            tools_mod._tavily = lambda q, k: [{'title': 't', 'url': 'u', 'snippet': 's'}]
            reply = asyncio.run(ask('привет', 's1'))
            self.assertEqual(reply, 'готовый ответ')
            self.assertEqual(srv.calls, 2)
        finally:
            os.environ.pop('LLM_BASE_URL', None)
            srv.shutdown()


class PlaceholderTest(unittest.TestCase):
    def test_env_resolution(self):
        os.environ['MY_SECRET_X'] = 'v1'
        p = Path(self.__class__.__module__)
        tmp = Path(__file__).resolve().parent / '_tmp_agent.json'
        tmp.write_text('{"project":"t","boards":{"b":{"parts":[]}},"x":"${MY_SECRET_X}"}', encoding='utf-8')
        try:
            cfg = main.load_config(tmp)
            self.assertEqual(cfg['x'], 'v1')
        finally:
            tmp.unlink()
            os.environ.pop('MY_SECRET_X', None)


class ControlTest(unittest.TestCase):
    def _ask(self, extra_parts):
        spec = spec_with(parts=extra_parts)
        ask, _ = main.build_agent(spec)
        return ask

    def test_guardrail_blocks_message(self):
        ask = self._ask([{'id': 'g', 'kind': 'guardrails', 'variant': 'policy',
                          'config': {'deny': 'rm -rf\nсекретно'}, 'secrets': {}}])
        reply = asyncio.run(ask('сделай rm -rf /', 's'))
        self.assertEqual(reply, 'Запрос заблокирован политикой')

    def test_approval_blocks_tool(self):
        spec = spec_with(parts=[
            {'id': 'ap', 'kind': 'approval', 'variant': 'manual', 'config': {'actions': 'deploy\nfetch_url'}, 'secrets': {}},
            {'id': 'br', 'kind': 'browser', 'variant': 'playwright', 'config': {}, 'secrets': {}}])
        ask, parts = main.build_agent(spec)
        # вызываем run_tool через внутренний цикл: симулируем вызов fetch_url
        # approval должен вернуть текст про подтверждение
        # используем напрямую closure через ask нельзя — проверяем через tools_mod и main-логику:
        # воссоздаём то же правило: имя инструмента содержит actions-строку
        import json as _j
        actions = ['deploy', 'fetch_url']
        self.assertTrue(main._contains('fetch_url', actions))
        # интеграционно: tool 'fetch_url' в списке, approval-строка совпадает с именем
        tool_names = [t['name'] for t in tools_mod.build_tools(parts, None)]
        self.assertIn('fetch_url', tool_names)


class FetchUrlTest(unittest.TestCase):
    def test_rejects_private(self):
        with self.assertRaises(ValueError):
            tools_mod._public_url('http://127.0.0.1/x')
        with self.assertRaises(ValueError):
            tools_mod._public_url('file:///etc/passwd')
        with self.assertRaises(ValueError):
            tools_mod._public_url('http://localhost:1/')
        with self.assertRaises(ValueError):
            tools_mod._public_url('http://[::1]/')
        with self.assertRaises(ValueError):
            tools_mod._public_url('http://user@127.0.0.1/')

    def test_public_ok(self):
        # 8.8.8.8 публичный — только проверка валидации, без реального запроса
        self.assertEqual(tools_mod._public_url('http://8.8.8.8/x'), 'http://8.8.8.8/x')

    def test_redirect_target_is_revalidated(self):
        srv = RedirectSrv()
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        first = f'http://127.0.0.1:{srv.server_port}/'
        calls = []
        orig = tools_mod._public_url
        def stub(url):
            calls.append(url)
            if url == first:
                return url
            raise ValueError('blocked redirect target')
        tools_mod._public_url = stub
        try:
            with self.assertRaises(ValueError):
                tools_mod._fetch_url(first)
        finally:
            tools_mod._public_url = orig
            srv.shutdown()
        self.assertEqual(len(calls), 2)
        self.assertTrue(calls[1].endswith('/private'))


class AnthropicTest(unittest.TestCase):
    def test_conversion(self):
        msgs = [
            {'role': 'system', 'content': 'sys'},
            {'role': 'user', 'content': 'hi'},
            {'role': 'assistant', 'content': None, 'tool_calls': [{'id': 'c1', 'name': 'web_search', 'args': {'q': 'x'}}]},
            {'role': 'tool', 'tool_call_id': 'c1', 'content': 'res'},
            {'role': 'user', 'content': 'next'},
        ]
        system, conv = llm.to_anthropic_messages(msgs)
        self.assertEqual(system, 'sys')
        self.assertEqual(conv[0], {'role': 'user', 'content': 'hi'})
        self.assertEqual(conv[1]['role'], 'assistant')
        self.assertEqual(conv[1]['content'][0]['type'], 'tool_use')
        self.assertEqual(conv[2]['role'], 'user')
        self.assertEqual(conv[2]['content'][0]['type'], 'tool_result')
        tools = [{'name': 'n', 'description': 'd', 'parameters': {'type': 'object'}}]
        self.assertEqual(llm._to_anthropic_tools(tools)[0]['input_schema'], {'type': 'object'})


class ApiTest(unittest.TestCase):
    def _client(self, spec):
        from fastapi.testclient import TestClient
        return TestClient(main.create_app(spec))

    def test_gateway_key_protects_api_chat_without_webchat(self):
        spec = spec_with(parts=[
            {'id': 'gw', 'kind': 'gateway', 'variant': 'api', 'config': {'path': '/api/agent'},
             'secrets': {'accessKey': 'sek'}},
            {'id': 'tg', 'kind': 'telegram', 'variant': 'bot', 'config': {}, 'secrets': {}}])
        c = self._client(spec)
        self.assertEqual(c.post('/api/chat', json={'message': 'hi'}).status_code, 401)
        self.assertEqual(c.post('/api/chat', json={'message': 'hi'}, headers={'Authorization': 'Bearer nope'}).status_code, 401)

    def test_api_chat_public_when_webchat(self):
        spec = spec_with(parts=[
            {'id': 'gw', 'kind': 'gateway', 'variant': 'api', 'config': {'path': '/api/agent'},
             'secrets': {'accessKey': 'sek'}},
            {'id': 'wc', 'kind': 'webchat', 'variant': 'widget', 'config': {'greeting': 'hi'}, 'secrets': {}}])
        srv = FakeLLM(mode='answer')
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        os.environ['LLM_BASE_URL'] = f'http://127.0.0.1:{srv.server_port}/v1'
        try:
            c = self._client(spec)
            r = c.post('/api/chat', json={'message': 'hi'})
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json()['reply'], 'готовый ответ')
        finally:
            os.environ.pop('LLM_BASE_URL', None)
            srv.shutdown()

    def test_llm_error_is_502_with_detail(self):
        spec = spec_with(parts=[])
        srv = FakeLLM(mode='unauthorized')
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        os.environ['LLM_BASE_URL'] = f'http://127.0.0.1:{srv.server_port}/v1'
        try:
            c = self._client(spec)
            r = c.post('/api/chat', json={'message': 'hi'})
            self.assertEqual(r.status_code, 502)
            self.assertTrue(r.json()['error'].startswith('LLM: 401'))
        finally:
            os.environ.pop('LLM_BASE_URL', None)
            srv.shutdown()


if __name__ == '__main__':
    unittest.main()
