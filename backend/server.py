"""Keyboard catalog API. Run with `python3 backend/server.py`.

Use the frontend's Vite server (npm run dev) for pages; /api is proxied here.
"""
import json
import math
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import db
import gemini_service as gemini
import scraper

HOST, PORT = "127.0.0.1", int(os.environ.get("KEYBOARD_API_PORT", "8000"))
INDEX = Path(__file__).parent.parent / "frontend" / "index.html"
MAX_BODY = 64 * 1024

_scrape_lock = threading.Lock()
_scrape_state = {"running": False, "log": []}


def _run_scrape(shops, use_llm):
    def log(msg):
        _scrape_state["log"] = (_scrape_state["log"] + [msg])[-200:]

    try:
        scraper.scrape(shops, use_llm=use_llm, log=log)
    except Exception as error:
        log(f"Scrape failed: {error!r}")
    finally:
        _scrape_state["running"] = False


def _float(params, key):
    if key not in params or params[key][0] == "":
        return None
    try:
        value = float(params[key][0])
        if not math.isfinite(value) or value < 0:
            raise ValueError
        return value
    except (ValueError, TypeError):
        raise gemini.ServiceError(f"{key} must be a nonnegative number.") from None


def _record(keyboard_id):
    conn = db.connect()
    try:
        record = db.get_by_id(conn, keyboard_id)
    finally:
        conn.close()
    if record is None:
        raise gemini.ServiceError("This keyboard could not be found.", 404, "keyboard_not_found")
    return record


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body, content_type="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass  # The visitor left the page while a request was running.

    def _error(self, error):
        self._send(error.status, {"error": str(error), "code": error.code})

    def do_GET(self):
        try:
            self._get()
        except gemini.ServiceError as error:
            self._error(error)
        except Exception:
            self._send(500, {"error": "The catalog could not be loaded. Please try again.", "code": "server_error"})

    def _get(self):
        url = urlparse(self.path)
        params = parse_qs(url.query)

        def first(key):
            return params.get(key, [""])[0].strip()

        detail = re.fullmatch(r"/api/keyboards/([1-9][0-9]*)", url.path)
        if url.path == "/":
            self._send(200, b"Keyboard Finder API is running. Open the frontend at http://localhost:5173.",
                       "text/plain; charset=utf-8")
        elif url.path == "/api/health":
            conn = db.connect()
            try:
                total = conn.execute("SELECT COUNT(*) FROM keyboards").fetchone()[0]
            finally:
                conn.close()
            self._send(200, {"gemini_available": gemini.configured(), "gemini_model": gemini.model_name(),
                             "total": total, "capabilities": {"ratings": False, "reviews": False}})
        elif url.path == "/api/keyboards":
            minimum, maximum = _float(params, "min_price"), _float(params, "max_price")
            if minimum is not None and maximum is not None and minimum > maximum:
                raise gemini.ServiceError("Minimum price cannot exceed maximum price.")
            conn = db.connect()
            try:
                rows = db.search(
                    conn, q=first("q"), shop=first("shop"), size=first("size"),
                    material=first("material"), switch=first("switch"),
                    min_price=minimum, max_price=maximum,
                    in_stock=first("in_stock") == "1",
                    brand=first("brand"), connectivity=first("connectivity"),
                    assembly=first("assembly"), switch_type=first("switch_type"),
                    hot_swap=first("hot_swap") == "1", currency=first("currency"),
                    sort=first("sort") or "keyboard_name", order=first("order"),
                )
            finally:
                conn.close()
            self._send(200, {"count": len(rows), "keyboards": rows})
        elif detail:
            self._send(200, {"keyboard": _record(int(detail[1])), "reviews": [], "review_summary": None})
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
            self._send(404, {"error": "This API endpoint could not be found.", "code": "not_found"})

    def _body(self):
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            raise gemini.ServiceError("Content-Type must be application/json.", 415)
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise gemini.ServiceError("Invalid request length.") from None
        if length < 0 or length > MAX_BODY:
            raise gemini.ServiceError("This request is too large.", 413)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, UnicodeDecodeError):
            raise gemini.ServiceError("Please send valid JSON.") from None
        if not isinstance(body, dict):
            raise gemini.ServiceError("The JSON request must be an object.")
        return body

    def do_POST(self):
        try:
            self._post()
        except gemini.ServiceError as error:
            self._error(error)
        except Exception:
            self._send(500, {"error": "This request could not be completed. Please try again.", "code": "server_error"})

    def _post(self):
        path = urlparse(self.path).path
        insight = re.fullmatch(r"/api/keyboards/([1-9][0-9]*)/insights", path)
        if path not in ("/api/preferences", "/api/recommendations", "/api/scrape") and not insight:
            return self._send(404, {"error": "This API endpoint could not be found.", "code": "not_found"})
        body = self._body()
        if path == "/api/preferences":
            conn = db.connect()
            try:
                facets = db.facets(conn)
            finally:
                conn.close()
            self._send(200, gemini.preferences(body, facets))
        elif path == "/api/recommendations":
            ids = gemini.keyboard_ids(body)
            conn = db.connect()
            try:
                rows = [db.get_by_id(conn, key) for key in ids]
            finally:
                conn.close()
            if any(row is None for row in rows):
                raise gemini.ServiceError("One or more keyboards could not be found.", 404, "keyboard_not_found")
            self._send(200, gemini.recommendations(body, rows))
        elif insight:
            self._send(200, gemini.insights(_record(int(insight[1])), body))
        else:
            known = set(scraper.SHOP_NAMES)
            raw_shops = body.get("shops")
            if raw_shops is not None and (not isinstance(raw_shops, list) or any(not isinstance(s, str) for s in raw_shops)):
                raise gemini.ServiceError("shops must be a list of store names.")
            if "llm" in body and not isinstance(body["llm"], bool):
                raise gemini.ServiceError("llm must be true or false.")
            shops = [s for s in raw_shops or [] if s in known] or None
            with _scrape_lock:
                if _scrape_state["running"]:
                    return self._send(409, {"error": "A catalog refresh is already running."})
                _scrape_state.update(running=True, log=[])
            threading.Thread(target=_run_scrape, args=(shops, bool(body.get("llm"))), daemon=True).start()
            self._send(202, {"started": True})

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    db.connect().close()
    print(f"Keyboard Finder API: http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
