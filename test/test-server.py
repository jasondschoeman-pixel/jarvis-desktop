#!/usr/bin/env python3
"""Test server that serves the Jarvis Desktop app and proxies API requests to Hermes.
All requests are same-origin (port 9876) to avoid CORS issues."""
import http.server
import http.client
import json
import os
import threading

DIST_DIR = '/home/jason/jarvis-desktop/dist'
DASH_HOST = '127.0.0.1'
DASH_PORT = 9120
SERVE_HOST = '127.0.0.1'
SERVE_PORT = 9119

# Store cookies per-session (simplified — just global)
dash_cookies = ''
serve_cookies = ''

class TestServer(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def do_GET(self):
        if self.path.startswith('/api/sessions') or self.path.startswith('/api/status') or self.path.startswith('/api/profiles'):
            self._proxy_to(DASH_HOST, DASH_PORT, 'GET', dash_cookies)
        elif self.path.startswith('/api/') and 'kanban' not in self.path:
            self._proxy_to(DASH_HOST, DASH_PORT, 'GET', dash_cookies)
        elif self.path == '/' or self.path == '/test-index.html':
            self._serve_file('test-index.html', 'text/html')
        else:
            super().do_GET()

    def do_POST(self):
        global dash_cookies, serve_cookies
        body = self._read_body()

        if self.path == '/auth/password-login':
            # Login to both servers, collect cookies
            dash_resp = self._raw_request(DASH_HOST, DASH_PORT, 'POST', '/auth/password-login', body)
            serve_resp = self._raw_request(SERVE_HOST, SERVE_PORT, 'POST', '/auth/password-login', body)
            dash_cookies = self._extract_cookies(dash_resp)
            serve_cookies = self._extract_cookies(serve_resp)
            ok = dash_resp['status'] == 200 and serve_resp['status'] == 200
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': ok}).encode())
        elif self.path == '/api/auth/ws-ticket':
            # Proxy to serve
            resp = self._raw_request(SERVE_HOST, SERVE_PORT, 'POST', '/api/auth/ws-ticket', body, serve_cookies)
            self.send_response(resp['status'])
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(resp['body'])
        else:
            self.send_error(404, f'Unknown POST path: {self.path}')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _proxy_to(self, host, port, method, cookies=''):
        path = self.path
        resp = self._raw_request(host, port, method, path, None, cookies)
        self.send_response(resp['status'])
        self.send_header('Content-Type', resp.get('content_type', 'application/json'))
        self.end_headers()
        self.wfile.write(resp['body'])

    def _raw_request(self, host, port, method, path, body=None, cookies=''):
        conn = http.client.HTTPConnection(host, port, timeout=10)
        headers = {'Content-Type': 'application/json'}
        if cookies:
            headers['Cookie'] = cookies
        try:
            conn.request(method, path, body=body, headers=headers)
            resp = conn.getresponse()
            data = resp.read()
            # Extract Set-Cookie headers
            cookie_list = resp.getheader('Set-Cookie')
            return {
                'status': resp.status,
                'body': data,
                'content_type': resp.getheader('Content-Type', 'application/json'),
                'set_cookie': cookie_list or '',
            }
        except Exception as e:
            return {
                'status': 502,
                'body': json.dumps({'error': str(e)}).encode(),
                'content_type': 'application/json',
                'set_cookie': '',
            }
        finally:
            conn.close()

    def _extract_cookies(self, resp):
        sc = resp.get('set_cookie', '')
        if not sc:
            return ''
        # Parse cookies from Set-Cookie header
        parts = []
        for c in sc.split(','):
            c = c.strip()
            if '=' in c:
                name_val = c.split(';')[0].strip()
                if '=' in name_val:
                    parts.append(name_val)
        return '; '.join(parts)

    def _read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        if length > 0:
            return self.rfile.read(length)
        return None

    def _serve_file(self, filename, content_type):
        filepath = os.path.join(DIST_DIR, filename)
        if os.path.exists(filepath):
            with open(filepath, 'r') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.end_headers()
            self.wfile.write(content.encode())
        else:
            self.send_error(404)

    def log_message(self, format, *args):
        # Suppress logs for clarity, or print for debugging
        print(f'[test-server] {args[0]} {args[1]} {args[2] if len(args) > 2 else ""}')

if __name__ == '__main__':
    server = http.server.HTTPServer(('127.0.0.1', 9876), TestServer)
    print(f'Test server running on http://127.0.0.1:9876')
    server.serve_forever()