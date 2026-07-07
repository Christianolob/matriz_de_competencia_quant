"""
High-resolution PNG export for the Quant Competence Matrix.

The skill tree is rendered client-side by ES modules, so it must be served
over HTTP and drawn by a real browser. This script does that deterministically:

  1. Serves the project directory on an ephemeral localhost port.
  2. Launches Edge/Chrome headless with the DevTools protocol enabled.
  3. Navigates to export.html and WAITS until the SVG `nodes-layer` actually
     has children (i.e. the tree finished rendering) -- this avoids the race
     where a plain `--screenshot` fires before the modules execute and produces
     an empty image.
  4. Captures a `SCALE`x screenshot clipped to the 2400x1800 world box.

Only the Python standard library is used (incl. a tiny WebSocket client for the
DevTools protocol), so no `pip install` is required.

Usage:  py export_image.py [scale]      (default scale = 4 -> 9600x7200)
"""

from __future__ import annotations

import base64
import json
import os
import socket
import struct
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "matrix.png"
WORLD_W, WORLD_H = 2400, 1800  # matches the SVG viewBox in export.html

BROWSER_CANDIDATES = [
    r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe",
    r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
    r"%ProgramFiles%\Google\Chrome\Application\chrome.exe",
    r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe",
    r"%LocalAppData%\Google\Chrome\Application\chrome.exe",
]


def find_browser():
    for raw in BROWSER_CANDIDATES:
        path = Path(os.path.expandvars(raw))
        if path.exists():
            return str(path)
    return None


# ---------------------------------------------------------------------------
# Static file server (background thread)
# ---------------------------------------------------------------------------

class _QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args):  # silence request logging
        pass


def start_server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _QuietHandler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


# ---------------------------------------------------------------------------
# Minimal WebSocket client (RFC 6455, text frames only) for the DevTools proto
# ---------------------------------------------------------------------------

class WebSocket:
    def __init__(self, url: str):
        assert url.startswith("ws://"), url
        host_port, _, path = url[len("ws://"):].partition("/")
        host, _, port = host_port.partition(":")
        self.sock = socket.create_connection((host, int(port or 80)))
        key = base64.b64encode(os.urandom(16)).decode()
        handshake = (
            f"GET /{path} HTTP/1.1\r\n"
            f"Host: {host_port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(handshake.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.sock.recv(1)
            if not chunk:
                raise ConnectionError("WebSocket handshake failed")
            buf += chunk
        self._buf = b""

    def send(self, text: str):
        payload = text.encode("utf-8")
        header = bytearray([0x81])  # FIN + text opcode
        mask = os.urandom(4)
        n = len(payload)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", n)
        header += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(header) + masked)

    def _read(self, n: int) -> bytes:
        while len(self._buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("WebSocket closed")
            self._buf += chunk
        out, self._buf = self._buf[:n], self._buf[n:]
        return out

    def recv(self) -> str:
        first = self._read(2)
        length = first[1] & 0x7F
        if length == 126:
            length = struct.unpack(">H", self._read(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", self._read(8))[0]
        # server frames are never masked
        return self._read(length).decode("utf-8", "replace")

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


class CDP:
    """Tiny DevTools-protocol client over a WebSocket."""

    def __init__(self, ws: WebSocket):
        self.ws = ws
        self._id = 0

    def call(self, method: str, params: dict | None = None):
        self._id += 1
        mid = self._id
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})
            # otherwise it's an async event -- ignore


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def main() -> int:
    scale = 4
    if len(sys.argv) > 1:
        try:
            scale = int(sys.argv[1])
        except ValueError:
            print(f"Escala invalida: {sys.argv[1]}", file=sys.stderr)
            return 2

    browser = find_browser()
    if not browser:
        print("[ERRO] Microsoft Edge ou Google Chrome nao encontrado.", file=sys.stderr)
        return 1
    print(f"Navegador: {browser}")

    httpd, port = start_server()
    url = f"http://127.0.0.1:{port}/export.html"
    print(f"Servidor local: {url}")

    profile = Path(os.environ.get("TEMP", str(ROOT))) / "matrix_export_profile"
    devtools_file = profile / "DevToolsActivePort"
    if devtools_file.exists():
        try:
            devtools_file.unlink()
        except OSError:
            pass

    proc = subprocess.Popen(
        [
            browser,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            f"--user-data-dir={profile}",
            "--remote-debugging-port=0",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        # The chosen debugging port is written to DevToolsActivePort once ready.
        devtools_port = None
        for _ in range(200):
            if devtools_file.exists():
                try:
                    devtools_port = int(devtools_file.read_text().splitlines()[0])
                    break
                except (ValueError, IndexError, OSError):
                    pass
            time.sleep(0.1)
        if devtools_port is None:
            print("[ERRO] Navegador headless nao inicializou (DevTools).", file=sys.stderr)
            return 1

        targets = json.load(
            urllib.request.urlopen(f"http://127.0.0.1:{devtools_port}/json", timeout=10)
        )
        ws_url = next(t["webSocketDebuggerUrl"] for t in targets if t["type"] == "page")
        cdp = CDP(WebSocket(ws_url))

        cdp.call("Page.enable")
        cdp.call(
            "Emulation.setDeviceMetricsOverride",
            {"width": WORLD_W, "height": WORLD_H, "deviceScaleFactor": 1, "mobile": False},
        )
        cdp.call("Page.navigate", {"url": url})

        # Wait until the tree has actually been drawn into the SVG.
        print("Aguardando renderizacao da arvore...")
        ready = False
        for _ in range(300):  # up to ~30s
            result = cdp.call(
                "Runtime.evaluate",
                {
                    "expression": (
                        "(()=>{const n=document.getElementById('nodes-layer');"
                        "return n?n.childElementCount:0;})()"
                    ),
                    "returnByValue": True,
                },
            )
            if (result.get("result", {}).get("value") or 0) > 0:
                ready = True
                break
            time.sleep(0.1)
        if not ready:
            print("[ERRO] A arvore nao renderizou a tempo.", file=sys.stderr)
            return 1

        # The tree (career rings, edges, nodes) extends well beyond the default
        # 2400x1800 viewBox, so a fixed clip captures only the central crop.
        # Measure the real content bounding box, then grow the SVG viewBox and
        # the page to fit ALL of it (plus a little padding) before screenshotting.
        fit = cdp.call(
            "Runtime.evaluate",
            {
                "expression": (
                    "(()=>{"
                    "const svg=document.getElementById('tree');"
                    "const bb=svg.getBBox();"
                    "const pad=Math.max(bb.width,bb.height)*0.03;"
                    "const x=bb.x-pad,y=bb.y-pad,"
                    "w=bb.width+pad*2,h=bb.height+pad*2;"
                    "svg.setAttribute('viewBox',x+' '+y+' '+w+' '+h);"
                    # Cap the longest side to BASE css px, keeping aspect ratio;
                    # the screenshot `scale` then multiplies this for resolution.
                    "const BASE=2400;const k=BASE/Math.max(w,h);"
                    "const cssW=Math.round(w*k),cssH=Math.round(h*k);"
                    "for(const e of [document.documentElement,document.body,"
                    "document.querySelector('.canvas-wrap'),svg]){"
                    "e.style.width=cssW+'px';e.style.height=cssH+'px';}"
                    "return JSON.stringify({w:cssW,h:cssH});"
                    "})()"
                ),
                "returnByValue": True,
            },
        )
        dims = json.loads(fit.get("result", {}).get("value") or "{}")
        out_w = int(dims.get("w") or WORLD_W)
        out_h = int(dims.get("h") or WORLD_H)

        # Resize the capture surface to match the fitted page.
        cdp.call(
            "Emulation.setDeviceMetricsOverride",
            {"width": out_w, "height": out_h, "deviceScaleFactor": 1, "mobile": False},
        )

        print(f"Capturando em {scale}x ({out_w * scale}x{out_h * scale})...")
        shot = cdp.call(
            "Page.captureScreenshot",
            {
                "format": "png",
                "captureBeyondViewport": True,
                "clip": {"x": 0, "y": 0, "width": out_w, "height": out_h, "scale": scale},
            },
        )
        OUT.write_bytes(base64.b64decode(shot["data"]))
        print(f"\nPronto! Imagem salva em:\n  {OUT}")
        return 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        httpd.shutdown()


if __name__ == "__main__":
    raise SystemExit(main())
