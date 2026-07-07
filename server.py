"""
Local development server for the Quant Competence Matrix.

Serves the static files like `python -m http.server`, plus accepts
`PUT /data/overrides.js` so the in-app editor can persist edits straight
to the repository file. After saving you only need to:

    git add data/overrides.js
    git commit -m "Update skill tree"
    git push

Implementation notes:
- Refuses to write any path other than `/data/overrides.js`.
- Disables SO_REUSEADDR so duplicate launches fail loudly instead of
  fighting over the same port (a common Windows pitfall).
- Listens on dual-stack IPv4 + IPv6 so both `http://localhost:PORT/` and
  `http://127.0.0.1:PORT/` reach the server.
- If the requested port is busy, tries the next ones until one is free
  and prints which one was actually used.
- Opens the default browser automatically once the port is bound.
"""

from __future__ import annotations

import json
import socket
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ALLOWED_WRITE_PATHS = {"/data/overrides.js"}
MAX_BODY_BYTES = 1_000_000  # 1 MB, plenty for a JS module


class TreeRequestHandler(SimpleHTTPRequestHandler):
    """Static file server with a single PUT endpoint for overrides.js."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format, *args):  # noqa: A002
        sys.stdout.write(
            "[%s] %s - %s\n"
            % (
                self.log_date_time_string(),
                self.address_string(),
                format % args,
            )
        )
        sys.stdout.flush()

    def do_PUT(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path not in ALLOWED_WRITE_PATHS:
            self._send_json(403, {"error": "path not writable"})
            return

        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            self._send_json(400, {"error": "empty body"})
            return
        if length > MAX_BODY_BYTES:
            self._send_json(413, {"error": "body too large"})
            return

        body = self.rfile.read(length)
        try:
            text = body.decode("utf-8")
        except UnicodeDecodeError:
            self._send_json(400, {"error": "body must be utf-8"})
            return

        target = (ROOT / path.lstrip("/")).resolve()
        try:
            target.relative_to(ROOT)
        except ValueError:
            self._send_json(403, {"error": "path escapes root"})
            return

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8", newline="\n")
        self._send_json(200, {"ok": True, "bytes": len(body)})

    def end_headers(self):
        # Disable caching so reloads always pick up the freshly written
        # overrides.js without a hard refresh.
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def _send_json(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class DualStackThreadingHTTPServer(ThreadingHTTPServer):
    """ThreadingHTTPServer that listens on IPv4+IPv6 when possible.

    Disables SO_REUSEADDR so a second launch on the same port fails
    immediately with OSError, instead of silently doubling listeners and
    causing reset connections (a Windows quirk).
    """

    allow_reuse_address = False
    address_family = (
        socket.AF_INET6 if socket.has_ipv6 else socket.AF_INET
    )

    def server_bind(self):
        # Allow IPv4 mapped onto IPv6 sockets so both stacks reach us.
        if self.address_family == socket.AF_INET6:
            try:
                self.socket.setsockopt(
                    socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0
                )
            except (AttributeError, OSError):
                pass
        super().server_bind()


def find_open_server(host, start_port, attempts=10):
    """Try ports [start_port, start_port + attempts) and return a server."""
    last_err = None
    for offset in range(attempts):
        port = start_port + offset
        try:
            return DualStackThreadingHTTPServer(
                (host, port), TreeRequestHandler
            )
        except OSError as err:
            last_err = err
            continue
    raise OSError(
        f"Could not bind to any port in {start_port}..{start_port + attempts - 1}: {last_err}"
    )


def main():
    requested_port = 8002
    if len(sys.argv) > 1:
        try:
            requested_port = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port: {sys.argv[1]}", file=sys.stderr)
            return 2

    # Empty host string + AF_INET6 = listen on :: (IPv6 wildcard) which,
    # with V6ONLY off, also accepts IPv4 connections.
    host = "" if socket.has_ipv6 else "127.0.0.1"

    try:
        server = find_open_server(host, requested_port)
    except OSError as err:
        print(str(err), file=sys.stderr)
        sys.stderr.flush()
        return 1

    actual_port = server.server_address[1]
    url = f"http://localhost:{actual_port}/"
    print("Quant Competence Matrix server")
    print(f"  serving {ROOT}")
    print(f"  at      {url}")
    if actual_port != requested_port:
        print(
            f"  (port {requested_port} was busy; using {actual_port} instead)"
        )
    print("  (Ctrl+C to stop)")
    print()
    sys.stdout.flush()

    # Open the browser shortly after the server starts accepting connections.
    threading.Thread(
        target=lambda: (time.sleep(0.6), webbrowser.open(url)),
        daemon=True,
    ).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
