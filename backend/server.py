"""Web server: JSON API over keyboards.db plus the viewer page.

    python3 backend/server.py        # then open http://127.0.0.1:8000
"""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import db
import scraper

HOST, PORT = "127.0.0.1", 8000
INDEX = Path(__file__).parent.parent / "frontend" / "index.html"

_scrape_lock = threading.Lock()
_scrape_state = {"running": False, "log": []}


def _run_scrape(shops, use_llm, with_ratings):
    def log(msg):
        _scrape_state["log"] = (_scrape_state["log"] + [msg])[-200:]

    try:
        scraper.scrape(shops, use_llm=use_llm, with_ratings=with_ratings, log=log)
    except Exception as e:  # keep the server alive and show the failure in the viewer
        log(f"Scrape failed: {e!r}")
    finally:
        _scrape_state["running"] = False


def _float(params, key):
    try:
        return float(params[key][0])
    except (KeyError, ValueError):
        return None


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body, content_type="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlparse(self.path)
        params = parse_qs(url.query)

        def first(key):
            return params.get(key, [""])[0].strip()

        if url.path == "/":
            self._send(200, INDEX.read_bytes(), "text/html; charset=utf-8")
        elif url.path == "/api/keyboards":
            conn = db.connect()
            try:
                rows = db.search(
                    conn, q=first("q"), shop=first("shop"), size=first("size"),
                    material=first("material"), switch=first("switch"),
                    min_price=_float(params, "min_price"), max_price=_float(params, "max_price"),
                    in_stock=first("in_stock") == "1",
                    brand=first("brand"), connectivity=first("connectivity"),
                    assembly=first("assembly"), switch_type=first("switch_type"),
                    hot_swap=first("hot_swap") == "1", min_rating=_float(params, "min_rating"),
                    sort=first("sort") or "keyboard_name", order=first("order"),
                )
            finally:
                conn.close()
            self._send(200, {"count": len(rows), "keyboards": rows})
        elif url.path == "/api/facets":
            conn = db.connect()
            try:
                facets = db.facets(conn)
            finally:
                conn.close()
            facets["all_shops"] = scraper.SHOP_NAMES
            self._send(200, facets)
        elif url.path == "/api/scrape":
            self._send(200, _scrape_state)
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if urlparse(self.path).path != "/api/scrape":
            return self._send(404, {"error": "not found"})
        # Requiring JSON stops other websites from triggering a scrape via a plain form post.
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            return self._send(415, {"error": "Content-Type must be application/json"})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._send(400, {"error": "invalid JSON"})
        known = set(scraper.SHOP_NAMES)
        shops = [s for s in body.get("shops") or [] if s in known] or None
        with _scrape_lock:
            if _scrape_state["running"]:
                return self._send(409, {"error": "a scrape is already running"})
            _scrape_state.update(running=True, log=[])
        threading.Thread(target=_run_scrape, args=(shops, bool(body.get("llm")), bool(body.get("ratings"))), daemon=True).start()
        self._send(202, {"started": True})

    def log_message(self, fmt, *args):
        pass  # quiet


if __name__ == "__main__":
    db.connect().close()  # create the database file on first run
    print(f"Keyboard database viewer: http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
