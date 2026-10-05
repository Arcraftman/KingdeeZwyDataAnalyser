"""Loopback-only finance bridge. Use SSH forwarding from Windows."""
import argparse
import hmac
import json
import os
from pathlib import Path
import secrets
import sys
import socket
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit, parse_qs

<<<<<<<< HEAD:KingdeeZwyDataAnalyser/service/serve.py
from ..core.project import project_root
from ..finance.snapshot import SCHEMA_VERSION, collect_snapshot, snapshot_json
from ..finance.registry import load_accountbooks
from ..finance.read_client import CheckFailure
from ..finance.interpretation import interpret, interpretation_xml
from ..auth.authorized_session import import_electron_authorization, reusable_accountbooks
========
from .project import project_root
from .snapshot import SCHEMA_VERSION, collect_snapshot, spreadsheet_xml, snapshot_json
from .read_client import CheckFailure
from .registry import load_accountbooks
from .interpretation import interpret, interpretation_xml
>>>>>>>> a6a901b16b65a84b641ecd7a55dd6be06740c1e8:python/data-analyser/src/serve.py


class FinanceHTTPServer(HTTPServer):
    allow_reuse_address = False

    def server_bind(self):
        if sys.platform == 'win32':
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=18768)
    args = parser.parse_args(argv)
    directory = project_root() / "runtime/service/finance"
    directory.mkdir(parents=True, exist_ok=True)
    token_file = directory / "access.token"
    if not token_file.exists():
        fd = os.open(token_file, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "w") as handle:
            handle.write(secrets.token_urlsafe(32))
    token_file.chmod(0o600)
    token = token_file.read_text().strip()
    if len(token) < 32:
        raise ValueError("本地访问令牌无效")

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def send(self, code, body, content_type="application/json; charset=utf-8"):
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token):
                self.send(401, b'{"error":"Unauthorized"}')
                return
            url = urlsplit(self.path)
            if url.path == "/health":
<<<<<<<< HEAD:KingdeeZwyDataAnalyser/service/serve.py
                self.send(200, json.dumps({"schema": SCHEMA_VERSION, "readOnly": True,
                                           "capabilities": ["companies", "snapshot-json"]}).encode())
                return
            if url.path == "/companies":
                try:
                    books = load_accountbooks(project_root() / "runtime/registry/accountbooks.json")
                    available = reusable_accountbooks(project_root(), [book for book in books.values() if book.enabled])
                    body = json.dumps({"companies": [
                        {"key": book.key, "name": book.name}
                        for book in available
                    ]}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
                    self.send(200, body)
                except (ValueError, OSError) as exc:
                    self.send(422, json.dumps({"error": str(exc)}, ensure_ascii=False).encode())
                return
            if url.path != "/snapshot.json":
========
                self.send(200, json.dumps({"schema": SCHEMA_VERSION, "readOnly": True, "capabilities": ["companies", "snapshot-json"]}).encode())
                return
            if url.path == "/companies":
                if url.query:
                    self.send(400, b'{"error":"Unexpected query"}')
                    return
                try:
                    books = load_accountbooks(project_root() / "runtime/registry/accountbooks.json")
                    companies = [{"key": key, "name": book.name}
                                 for key, book in books.items() if book.enabled]
                    body = json.dumps({"schema": SCHEMA_VERSION, "companies": companies},
                                      ensure_ascii=False).encode("utf-8")
                    self.send(200, body)
                except ValueError as exc:
                    self.send(422, json.dumps({"error": str(exc)}, ensure_ascii=False).encode("utf-8"))
                return
            if url.path not in ("/snapshot", "/snapshot.json"):
>>>>>>>> a6a901b16b65a84b641ecd7a55dd6be06740c1e8:python/data-analyser/src/serve.py
                self.send(404, b'{"error":"Not found"}')
                return
            query = parse_qs(url.query)
            if set(query) != {"company", "month"} or any(len(v) != 1 for v in query.values()):
                self.send(400, b'{"error":"Expected company and month"}')
                return
            try:
                snapshot = collect_snapshot(project_root(), query["company"][0], query["month"][0])
<<<<<<<< HEAD:KingdeeZwyDataAnalyser/service/serve.py
                self.send(200, snapshot_json(snapshot))
========
                if url.path == "/snapshot.json":
                    self.send(200, snapshot_json(snapshot))
                else:
                    self.send(200, spreadsheet_xml(snapshot), "application/xml; charset=utf-8")
>>>>>>>> a6a901b16b65a84b641ecd7a55dd6be06740c1e8:python/data-analyser/src/serve.py
            except (CheckFailure, ValueError) as exc:
                self.send(422, json.dumps({"error": str(exc)}, ensure_ascii=False).encode())
            except Exception:
                self.send(502, b'{"error":"Read failed; previous workbook data is unchanged"}')

        def do_POST(self):
            if not hmac.compare_digest(self.headers.get('Authorization',''), 'Bearer '+token):
                self.send(401,b'Unauthorized')
                return
            if self.path == '/authorized-session':
                try:
                    size = int(self.headers.get('Content-Length', '0'))
                    if not 0 < size <= 128000:
                        raise ValueError('授权数据大小无效')
                    payload = json.loads(self.rfile.read(size).decode('utf-8'))
                    if (not isinstance(payload, dict) or not isinstance(payload.get('origins'), list)
                            or not all(isinstance(origin, str) for origin in payload['origins'])
                            or not isinstance(payload.get('cookies'), list)):
                        raise ValueError('授权数据格式无效')
                    records = import_electron_authorization(project_root(), payload['origins'], payload['cookies'])
                    self.send(200, json.dumps({'companies': [{'key': row['key'], 'name': row['name']} for row in records]},
                                              ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
                except (ValueError, OSError, RuntimeError) as exc:
                    self.send(422, json.dumps({'error': str(exc)}, ensure_ascii=False).encode('utf-8'))
                return
            if self.path != '/interpretations':
                self.send(404,b'Not found')
                return
            try:
                size = int(self.headers.get('Content-Length','0'))
                if not 0 < size <= 32000:
                    raise ValueError('解读数据大小无效')
                payload = json.loads(self.rfile.read(size).decode('utf-8'))
                result = interpret(project_root(),payload)
                self.send(200,interpretation_xml(result),'application/xml; charset=utf-8')
            except (ValueError,OSError) as exc:
                self.send(422,str(exc).encode('utf-8'),'text/plain; charset=utf-8')
            except Exception:
                self.send(502,'解读生成失败，财务数据已保留'.encode('utf-8'),'text/plain; charset=utf-8')

    server = FinanceHTTPServer(("127.0.0.1", args.port), Handler)
    pid_file = directory / "service.pid"
    pid_file.write_text(str(os.getpid()), encoding="ascii")
    print(f"只读财务服务：http://127.0.0.1:{args.port}；令牌文件：{token_file}", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        if pid_file.exists() and pid_file.read_text(encoding="ascii").strip() == str(os.getpid()):
            pid_file.unlink()


if __name__ == "__main__":
    main()
