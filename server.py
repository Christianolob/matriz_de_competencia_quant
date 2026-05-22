"""
Local development server for the Quant Competence Matrix.

Serves static files like `python -m http.server`, but also accepts
`PUT /data/overrides.js` so the in-app editor can persist edits straight
to the repository file. After saving you only need to:

    git add data/overrides.js
    git commit -m "Update skill tree overrides"
    git push

The server binds to 127.0.0.1 only and refuses to write any path other
than `/data/overrides.js`, so it is safe to run on a personal machine.
"""

from __future__ import annotations

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ALLOWED_WRITE_PATHS = {"/data/overrides.js"}
MAX_BODY_BYTES = 1_000_000  # 1 MB, plenty for a JS module


class TreeRequestHandler(SimpleHTTPRequestHandler):
    """Static file server with a single PUT endpoint for overrides.js."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        # Slightly less noisy than the default handler.
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), format % args))

    def do_PUT(self) -> None:  # noqa: N802 (BaseHTTPRequestHandler API)
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
        # Defence in depth: confirm the resolved path is still inside ROOT
        # and matches the allow-list.
        try:
            target.relative_to(ROOT)
        except ValueError:
            self._send_json(403, {"error": "path escapes root"})
            return

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8", newline="\n")
        self._send_json(200, {"ok": True, "bytes": len(body)})

    def end_headers(self) -> None:
        # Disable caching so reloads always pick up the freshly written
        # overrides.js without a hard refresh.
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def _send_json(self, status: int, payload: dict) -> None:
        import json

        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> int:
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port: {sys.argv[1]}", file=sys.stderr)
            return 2

    address = ("127.0.0.1", port)
    server = ThreadingHTTPServer(address, TreeRequestHandler)
    url = f"http://{address[0]}:{port}/"
    print(f"Quant Competence Matrix server")
    print(f"  serving {ROOT}")
    print(f"  at      {url}")
    print(f"  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
