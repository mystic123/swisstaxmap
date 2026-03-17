#!/usr/bin/env python3
"""
Lightweight caching proxy server for the Swiss Tax Calculator.

Serves static files AND proxies ESTV API requests with SQLite caching.
This avoids hammering the ESTV API when recalculating the same parameters.

Usage: python3 server.py [--port 8000]

All ESTV API calls are cached in data/tax-cache.sqlite.
Cache key = sha256(endpoint + payload).
"""

import hashlib
import http.server
import json
import sqlite3
import sys
import threading
import time
import urllib.request
from pathlib import Path
from socketserver import ThreadingMixIn
from urllib.error import URLError

PORT = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8000
PROJECT_ROOT = Path(__file__).resolve().parent
CACHE_DB_PATH = PROJECT_ROOT / "data" / "tax-cache.sqlite"
ESTV_BASE = "https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV/"
MAX_PAYLOAD = 64 * 1024  # 64 KB max POST body

ALLOWED_ENDPOINTS = {
    "API_searchLocation",
    "API_calculateDetailedTaxes",
    "API_calculateTaxBudget",
}

# File extensions allowed to be served via GET
BLOCKED_EXTENSIONS = {".sqlite", ".sqlite-wal", ".sqlite-shm", ".db", ".py", ".pyc"}


def init_db():
    db = sqlite3.connect(str(CACHE_DB_PATH), check_same_thread=False)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA busy_timeout=5000")
    db.execute("""
        CREATE TABLE IF NOT EXISTS cache (
            key TEXT PRIMARY KEY,
            endpoint TEXT NOT NULL,
            response TEXT NOT NULL,
            created_at REAL NOT NULL
        )
    """)
    db.commit()
    return db


DB = init_db()
DB_LOCK = threading.Lock()


def cache_key(endpoint, payload_bytes):
    return hashlib.sha256(endpoint.encode() + b":" + payload_bytes).hexdigest()


def cache_get(key):
    with DB_LOCK:
        row = DB.execute("SELECT response FROM cache WHERE key = ?", (key,)).fetchone()
        return row[0] if row else None


def cache_put(key, endpoint, response_str):
    with DB_LOCK:
        DB.execute(
            "INSERT OR REPLACE INTO cache (key, endpoint, response, created_at) VALUES (?, ?, ?, ?)",
            (key, endpoint, response_str, time.time()),
        )
        DB.commit()


def cache_clear():
    with DB_LOCK:
        count = DB.execute("SELECT COUNT(*) FROM cache").fetchone()[0]
        DB.execute("DELETE FROM cache")
        DB.commit()
        return count


class ThreadingHTTPServer(ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def do_GET(self):
        # Block sensitive files
        path = self.path.split("?")[0]
        for ext in BLOCKED_EXTENSIONS:
            if path.endswith(ext):
                self.send_error(403, "Forbidden")
                return
        super().do_GET()

    def do_POST(self):
        if not self.path.startswith("/api/"):
            self.send_error(404)
            return

        endpoint = self.path[5:]

        # Cache clear endpoint
        if endpoint == "clear-cache":
            count = cache_clear()
            self._send_json(json.dumps({"cleared": count}))
            return

        if endpoint not in ALLOWED_ENDPOINTS:
            self.send_error(400, "Unknown endpoint")
            return

        # Validate Content-Length
        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            self.send_error(400, "Invalid Content-Length")
            return

        if content_length > MAX_PAYLOAD:
            self.send_error(413, "Payload too large")
            return

        payload_bytes = self.rfile.read(content_length)

        key = cache_key(endpoint, payload_bytes)

        # Check cache
        cached = cache_get(key)
        if cached:
            self._send_json(cached)
            return

        # Proxy to ESTV
        url = ESTV_BASE + endpoint
        req = urllib.request.Request(
            url, data=payload_bytes, headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                response_bytes = resp.read()
        except URLError:
            self.send_error(502, "Upstream API unavailable")
            return

        response_str = response_bytes.decode("utf-8")

        try:
            cache_put(key, endpoint, response_str)
        except sqlite3.Error as e:
            print(f"Cache write error: {e}", file=sys.stderr)

        self._send_json(response_str)

    def _send_json(self, json_str):
        data = json_str.encode("utf-8") if isinstance(json_str, str) else json_str
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        msg = format % args
        if "/api/" in msg:
            sys.stderr.write(f"  {msg}\n")


def main():
    server = ThreadingHTTPServer(("", PORT), Handler)
    with DB_LOCK:
        cached_count = DB.execute("SELECT COUNT(*) FROM cache").fetchone()[0]
    print(f"Swiss Tax Calculator server on http://localhost:{PORT}")
    print(f"  SQLite cache: {CACHE_DB_PATH} ({cached_count} cached responses)")
    print(f"  Static files: {PROJECT_ROOT}")
    print(f"  ESTV proxy: /api/<endpoint> (threaded)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
