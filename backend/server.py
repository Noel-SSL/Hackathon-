"""Web server: JSON API over keyboards.db plus the viewer page.

    python3 backend/server.py        # then open http://127.0.0.1:8000

The website itself runs from frontend/ with `npm run dev`, which forwards /api here.

Gemini routes used by the website:
    POST /api/chat                    shopping assistant      (function calling, chat.py)
    POST /api/preferences             a sentence -> filters   (structured output)
    POST /api/vision                  a photo -> filters      (image input)
    POST /api/recommendations         ranking with reasons    (structured output)
    POST /api/keyboards/<id>/insights the specs, explained    (structured output)
    POST /api/keyboards/<id>/reviews  reviews from the web    (Google Search grounding)
"""
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import chat
import db
import gemini_client
import gemini_reviews
import gemini_service
import gemini_vision
import scraper

HOST, PORT = "127.0.0.1", 8000
MAX_BODY_BYTES = 200_000
MAX_PHOTO_BYTES = 6_000_000  # a base64 photo sent to /api/vision
KEYBOARD_PATH = re.compile(r"/api/keyboards/([1-9][0-9]*)(/insights|/reviews)?")
GEMINI_PATHS = ("/api/preferences", "/api/vision", "/api/recommendations")
INDEX = Path(__file__).parent.parent / "frontend" / "index.html"
CHAT_DEMO = Path(__file__).parent / "chat_demo.html"  # temporary chatbot test page

_scrape_lock = threading.Lock()
_scrape_state = {"running": False, "log": []}


def _run_scrape(shops, use_llm, with_ratings, with_summaries):
    def log(msg):
        _scrape_state["log"] = (_scrape_state["log"] + [msg])[-200:]

    try:
        scraper.scrape(shops, use_llm=use_llm, with_ratings=with_ratings,
                       with_summaries=with_summaries, log=log)
    except Exception as e:  # keep the server alive and show the failure in the viewer
        log(f"Scrape failed: {e!r}")
    finally:
        _scrape_state["running"] = False


def _float(params, key):
    try:
        return float(params[key][0])
    except (KeyError, ValueError):
        return None


def _facets():
    conn = db.connect()
    try:
        facets = db.facets(conn)
        facets["rated_count"] = conn.execute(
            "SELECT COUNT(*) FROM keyboards WHERE rating IS NOT NULL").fetchone()[0]
    finally:
        conn.close()
    return facets


def _keyboard(keyboard_id):
    conn = db.connect()
    try:
        keyboard = db.get_by_id(conn, keyboard_id)
    finally:
        conn.close()
    if keyboard is None:
        raise gemini_client.ServiceError("This keyboard could not be found.", 404, "keyboard_not_found")
    return keyboard


def _web_review(keyboard_id, lookup=False):
    """The cached Google Search review summary; with lookup, research it if missing."""
    conn = db.connect()
    try:
        review = db.get_web_review(conn, keyboard_id)
        if review is None and lookup:
            db.save_web_review(conn, keyboard_id, gemini_reviews.summarize(_keyboard(keyboard_id)))
            review = db.get_web_review(conn, keyboard_id)
        return review
    finally:
        conn.close()


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

        detail = KEYBOARD_PATH.fullmatch(url.path)
        if url.path == "/":
            self._send(200, INDEX.read_bytes(), "text/html; charset=utf-8")
        elif url.path == "/api/health":
            self._send(200, {"gemini_available": gemini_client.configured(),
                             "gemini_model": gemini_client.model_name()})
        elif detail and not detail[2]:
            try:
                keyboard = _keyboard(int(detail[1]))
            except gemini_client.ServiceError as e:
                return self._send(e.status, {"error": str(e), "code": e.code})
            self._send(200, {"keyboard": keyboard, "web_review": _web_review(keyboard["id"])})
        elif url.path == "/chat":
            self._send(200, CHAT_DEMO.read_bytes(), "text/html; charset=utf-8")
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
            facets = _facets()
            facets["all_shops"] = scraper.SHOP_NAMES
            self._send(200, facets)
        elif url.path == "/api/scrape":
            self._send(200, _scrape_state)
        else:
            self._send(404, {"error": "not found"})

    def _read_json(self, limit=MAX_BODY_BYTES):
        """Parse a JSON request body, or send the error response and return None."""
        # Requiring JSON stops other websites from posting here via a plain form post.
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            self._send(415, {"error": "Content-Type must be application/json"})
            return None
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > limit:
                self._send(413, {"error": "request body too large"})
                return None
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._send(400, {"error": "invalid JSON"})
            return None
        if not isinstance(body, dict):
            self._send(400, {"error": "body must be a JSON object"})
            return None
        return body

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/chat":
            return self._chat()
        keyboard_action = KEYBOARD_PATH.fullmatch(path)
        if path in GEMINI_PATHS or (keyboard_action and keyboard_action[2]):
            return self._gemini(path)
        if path != "/api/scrape":
            return self._send(404, {"error": "not found"})
        body = self._read_json()
        if body is None:
            return
        known = set(scraper.SHOP_NAMES)
        shops = [s for s in body.get("shops") or [] if s in known] or None
        with _scrape_lock:
            if _scrape_state["running"]:
                return self._send(409, {"error": "a scrape is already running"})
            _scrape_state.update(running=True, log=[])
        threading.Thread(target=_run_scrape, args=(shops, bool(body.get("llm")), bool(body.get("ratings")), bool(body.get("summaries"))), daemon=True).start()
        self._send(202, {"started": True})

    def _chat(self):
        """POST {"message": str, "history": [{"role": "user"|"assistant", "content": str}]}
        -> {"reply": markdown, "keyboards": [cards for the keyboards the reply links to]}."""
        body = self._read_json()
        if body is None:
            return
        message, history = body.get("message"), body.get("history") or []
        if not isinstance(message, str) or not isinstance(history, list):
            return self._send(400, {"error": "message must be a string and history a list"})
        try:
            self._send(200, chat.reply(message, history))
        except ValueError as e:
            self._send(400, {"error": str(e)})
        except chat.ChatUnavailable as e:
            self._send(503, {"error": str(e)})
        except chat.ChatError as e:
            self._send(502, {"error": str(e)})
        except Exception as e:  # never drop the connection on a bug; show it in the chat box
            self._send(500, {"error": f"chatbot failed: {e!r}"})

    def _gemini(self, path):
        """The website's other Gemini features. Every answer is checked against the
        catalog before it is sent, so a filter or keyboard id Gemini made up is an error."""
        body = self._read_json(MAX_PHOTO_BYTES if path == "/api/vision" else MAX_BODY_BYTES)
        if body is None:
            return
        try:
            self._send(200, self._gemini_result(path, body))
        except gemini_client.ServiceError as e:
            self._send(e.status, {"error": str(e), "code": e.code})
        except Exception as e:  # same as the chatbot: report the bug instead of hanging up
            self._send(500, {"error": f"request failed: {e!r}"})

    def _gemini_result(self, path, body):
        if path == "/api/preferences":
            return gemini_service.preferences(body, _facets())
        if path == "/api/vision":
            return gemini_vision.from_photo(body, _facets())
        if path == "/api/recommendations":
            keyboards = [_keyboard(i) for i in gemini_service.keyboard_ids(body)]
            return gemini_service.recommendations(body, keyboards)

        keyboard_id, action = KEYBOARD_PATH.fullmatch(path).groups()
        if action == "/insights":
            return gemini_service.insights(_keyboard(int(keyboard_id)), body)
        return {"web_review": _web_review(int(keyboard_id), lookup=True)}

    def log_message(self, fmt, *args):
        pass  # quiet


if __name__ == "__main__":
    db.connect().close()  # create the database file on first run
    print(f"Keyboard database viewer: http://{HOST}:{PORT}")
    print(f"Chatbot test page:        http://{HOST}:{PORT}/chat")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
