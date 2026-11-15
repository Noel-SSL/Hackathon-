"""Summarise each keyboard's written reviews with Google Gemini.

    python3 backend/summarize.py                  # every keyboard with enough reviews
    python3 backend/summarize.py --shop Epomaker  # one shop

Needs GEMINI_API_KEY in the project's .env file (GEMINI_MODEL optionally picks
the model). Only the review titles, texts and star ratings are sent, never
reviewer names. A summary is regenerated only when the reviews change.
"""
import argparse
import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import db

ENV_FILE = Path(__file__).parent.parent / ".env"
API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
API_REVISION = "2026-05-20"
DEFAULT_MODEL = "gemini-3.5-flash-lite"
MIN_REVIEWS = 3        # fewer written reviews than this is too little to summarise
DELAY_SECONDS = 4.0    # between Gemini requests (free-tier keys allow ~15 per minute)
MAX_RETRIES = 4        # on rate limiting (429) or overload (5xx)

SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string", "description": "2-3 sentences on what reviewers say overall"},
        "pros": {"type": "array", "items": {"type": "string"}, "description": "up to 4 short points"},
        "cons": {"type": "array", "items": {"type": "string"}, "description": "up to 4 short points"},
    },
    "required": ["summary", "pros", "cons"],
}

INSTRUCTIONS = (
    "You summarise customer reviews of a keyboard for a product comparison site. "
    "Use only what the reviews say. Mention specifics reviewers raise (sound, typing feel, "
    "build quality, software, battery, shipping) when they come up. If reviewers disagree, say so. "
    "Pros and cons are short phrases; leave cons empty if no reviewer raised a problem. "
    "Ignore reviews that only talk about shipping or the shop unless that is all there is."
)


class GeminiUnavailable(Exception):
    """Gemini can't be used at all (missing key, rejected key, unknown model)."""


def load_env():
    """Read KEY=value lines from .env into os.environ (existing variables win)."""
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def _call_gemini(prompt):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise GeminiUnavailable(f"GEMINI_API_KEY is not set (add it to {ENV_FILE})")
    body = {
        "model": os.environ.get("GEMINI_MODEL", DEFAULT_MODEL),
        "system_instruction": INSTRUCTIONS,
        "input": prompt,
        "response_format": {"type": "text", "mime_type": "application/json", "schema": SCHEMA},
    }
    req = urllib.request.Request(
        API_URL, data=json.dumps(body).encode(), method="POST",
        headers={"x-goog-api-key": key, "Content-Type": "application/json", "Api-Revision": API_REVISION})
    for attempt in range(MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.load(resp)
            break
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:300]
            if e.code in (400, 401, 403, 404):
                raise GeminiUnavailable(f"Gemini rejected the request ({e.code}): {detail}") from e
            if e.code not in (429, 500, 503) or attempt == MAX_RETRIES:
                raise  # caller skips this keyboard
            # Rate limited or overloaded: wait as told, else back off 15s, 30s, 60s, ...
            try:
                wait = float(e.headers.get("Retry-After"))
            except (TypeError, ValueError):
                wait = 15 * 2 ** attempt
            time.sleep(min(wait, 120))
    texts = [block.get("text", "") for step in data.get("steps", [])
             for block in step.get("content", []) if isinstance(block, dict)]
    text = next((t for t in reversed(texts) if t.strip()), "")
    return json.loads(text)


def _prompt(keyboard, reviews):
    lines = [f"Keyboard: {keyboard['keyboard_name']} (sold by {keyboard['shop']})",
             f"Average rating: {keyboard['rating']} / 5 from {keyboard['review_count']} reviews; "
             f"{len(reviews)} of them are below.", ""]
    for r in reviews:
        stars = f"{r['rating']:g}/5" if r["rating"] is not None else "unrated"
        title = f"{r['title']}: " if r["title"] else ""
        lines.append(f"- [{stars}] {title}{r['body']}")
    return "\n".join(lines)


def _hash(reviews):
    return hashlib.sha256(json.dumps([dict(r) for r in reviews], sort_keys=True).encode()).hexdigest()


def run(conn, shop_names=None, log=print):
    """Summarise every keyboard whose reviews changed since its last summary."""
    load_env()
    keyboards = conn.execute(
        "SELECT k.* FROM keyboards k WHERE (SELECT COUNT(*) FROM reviews r WHERE r.keyboard_id = k.id) >= ? "
        "ORDER BY k.review_count DESC", (MIN_REVIEWS,)).fetchall()
    todo = []
    for kb in keyboards:
        if shop_names and kb["shop"] not in shop_names:
            continue
        reviews = conn.execute("SELECT rating, title, body FROM reviews WHERE keyboard_id = ? ORDER BY position",
                               (kb["id"],)).fetchall()
        if kb["summary_reviews_hash"] != _hash(reviews):
            todo.append((kb, reviews))
    log(f"Summaries: {len(todo)} keyboards to summarise")
    done = 0
    for i, (kb, reviews) in enumerate(todo, 1):
        if i > 1:
            time.sleep(DELAY_SECONDS)
        try:
            result = _call_gemini(_prompt(kb, reviews))
        except GeminiUnavailable as e:
            log(f"Summaries stopped: {e}")
            break
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as e:
            log(f"Summaries: skipped {kb['keyboard_name']!r} ({e})")
            continue
        conn.execute(
            "UPDATE keyboards SET review_summary = ?, review_pros = ?, review_cons = ?, "
            "summary_reviews_hash = ?, summary_generated_at = ? WHERE id = ?",
            (str(result.get("summary", "")).strip() or None,
             json.dumps([str(p) for p in result.get("pros", [])][:4]),
             json.dumps([str(c) for c in result.get("cons", [])][:4]),
             _hash(reviews), datetime.now(timezone.utc).isoformat(timespec="seconds"), kb["id"]))
        conn.commit()
        done += 1
        if i % 10 == 0:
            log(f"Summaries: {i}/{len(todo)} done")
    log(f"Summaries: wrote {done} summaries")
    return done


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Summarise keyboard reviews with Gemini")
    parser.add_argument("--shop", action="append", help="only this shop (repeatable)")
    args = parser.parse_args()
    connection = db.connect()
    try:
        run(connection, args.shop)
    finally:
        connection.close()
