"""
Servidor local (somente leitura) do frontend "Empresas Quant BR".

Serve a pasta empresas_quant/ e redireciona `/` para `/web/`.
Mesmo comportamento do servidor da matriz (../matriz_competencias/server.py):
IPv4+IPv6, fallback de porta se ocupada e abre o navegador automaticamente.
"""

from __future__ import annotations

import socket
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):  # noqa: N802
        if self.path.split("?", 1)[0] in ("", "/"):
            self.send_response(302)
            self.send_header("Location", "/web/")
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, format, *args):  # noqa: A002
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), format % args))
        sys.stdout.flush()


class DualStackServer(ThreadingHTTPServer):
    allow_reuse_address = False
    address_family = socket.AF_INET6 if socket.has_ipv6 else socket.AF_INET

    def server_bind(self):
        if self.address_family == socket.AF_INET6:
            try:
                self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            except (AttributeError, OSError):
                pass
        super().server_bind()


def find_open_server(host, start_port, attempts=10):
    last_err = None
    for port in range(start_port, start_port + attempts):
        try:
            return DualStackServer((host, port), Handler)
        except OSError as err:
            last_err = err
    raise OSError(f"Nenhuma porta livre em {start_port}..{start_port + attempts - 1}: {last_err}")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8010
    host = "" if socket.has_ipv6 else "127.0.0.1"
    try:
        server = find_open_server(host, port)
    except OSError as err:
        print(err, file=sys.stderr)
        return 1

    url = f"http://localhost:{server.server_address[1]}/"
    print("Empresas Quant BR")
    print(f"  servindo {ROOT}")
    print(f"  em       {url}")
    print("  (Ctrl+C para parar)\n")
    sys.stdout.flush()
    threading.Thread(target=lambda: (time.sleep(0.6), webbrowser.open(url)), daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nencerrando")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
