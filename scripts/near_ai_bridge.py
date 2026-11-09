#!/usr/bin/env python3
"""Bounden dev bridge: NEAR AI Cloud for the worker, key never on disk.

LOCAL DEVELOPMENT TOOL — not part of the shipped product.

Why this exists: the cashier worker reads its NEAR AI Cloud API key
from its own process environment (worker/src/ai-cloud-attestation.ts),
but in this environment the real key lives only in the Muse
connector vault (custom.near-ai-cloud) and must never be written to
disk, logged, or placed in a file. This bridge closes that gap without
moving the key:

  worker --(http://127.0.0.1:<port>/v1, Authorization: Bearer
            via-connector-bridge — a literal placeholder, NOT a key)-->
  this bridge --(https://cloud-api.near.ai/v1, Authorization: Bearer
            hsurr:… surrogate injected per request)--> NEAR AI Cloud

The surrogate is obtained with the same dynamic_credentials mechanism
the connector helper (custom.near-ai-cloud/bin/near_ai_api.py) uses;
the runtime swaps it for the real credential on the approved outbound
request to cloud-api.near.ai. The bridge never sees, stores, or logs
the real key — and it never logs ANY header or body, surrogate
included. Its log lines carry only: timestamp, method, path, upstream
status, and byte counts.

Usage:
  python3 scripts/near_ai_bridge.py [port]        # default 8791

Worker env for use with the bridge:
  BOUNDEN_ATTESTATION_PROVIDER=near-ai
  NEAR_AI_CLOUD_API_KEY=via-connector-bridge      # placeholder, not a key
  NEAR_AI_CLOUD_MODEL=deepseek/deepseek-v3.2
  NEAR_AI_CLOUD_BASE_URL=http://127.0.0.1:8791/v1

Loopback only: the server binds 127.0.0.1 and refuses nothing else
because nothing else can reach it. Redirects are refused, matching
the connector helper.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request  # noqa: E402

UPSTREAM = "https://cloud-api.near.ai"
HOST = "cloud-api.near.ai"
CREDENTIAL = "custom.near-ai-cloud"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise RuntimeError("redirect refused, verify the endpoint")


def log(msg: str) -> None:
    print(f"[near-ai-bridge] {msg}", flush=True)


def forward(method: str, path: str, body: bytes | None):
    """One upstream call. Returns (status, content_type, payload_bytes).

    A fresh request is built here: nothing from the inbound request is
    forwarded except the method, the /v1 path, and the body bytes, so
    the worker's placeholder Authorization header can never leak
    upstream — the only Authorization sent is the surrogate's.
    """
    headers = {}
    data = None
    if body is not None:
        data = body
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(UPSTREAM + path, data=data, headers=headers, method=method)
    add_surrogate_to_request(req, CREDENTIAL, allowed_hosts=[HOST])
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(req, timeout=120) as resp:
            return resp.status, resp.headers.get("Content-Type", "application/json"), resp.read()
    except urllib.error.HTTPError as e:
        ctype = e.headers.get("Content-Type", "application/json") if e.headers else "application/json"
        return e.code, ctype, e.read()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):  # silence the default access log (it would print paths only, but keep one log format)
        pass

    def _handle(self, method: str) -> None:
        path = self.path  # includes the query string
        if not path.startswith("/v1/"):
            payload = json.dumps({"error": "bridge forwards /v1/* only"}).encode()
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            log(f"{method} {path} -> 404 (not a /v1 path)")
            return
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length > 0 else None
        try:
            status, ctype, payload = forward(method, path, body)
        except Exception as e:  # transport failure: report status only, never internals with headers
            payload = json.dumps({"error": f"bridge upstream failure: {type(e).__name__}"}).encode()
            status, ctype = 502, "application/json"
            log(f"{method} {path} -> 502 ({type(e).__name__})")
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        try:
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            # The client gave up waiting (the worker's client timeout is
            # 30s; a slow upstream call can exceed it). One log line, no
            # traceback — the bridge log is run evidence and stays clean.
            log(f"{method} {path} -> {status} ({len(payload)} bytes, client disconnected)")
            return
        log(f"{method} {path} -> {status} ({len(payload)} bytes)")

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8791
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    log(f"listening on http://127.0.0.1:{port}/v1 -> {UPSTREAM}/v1 (credential: surrogate via {CREDENTIAL})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
