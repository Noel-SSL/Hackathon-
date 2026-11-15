"""Review summaries grounded in Google Search.

summarize.py summarises the written reviews that ratings.py finds on a shop's
product page. Many keyboards have none there, so for those Gemini looks the
keyboard up with the Google Search tool instead. This runs in two steps:

  1. a grounded call collects what buyers and reviewers say, and Google
     returns the pages it used (groundingMetadata)
  2. a structured-output call shapes those notes into fixed fields

Source links always come from Google's grounding metadata, never from model
text, so a link on the page is a page Gemini really read. If nothing was
cited, no summary is stored. Results are cached in the web_reviews table.

https://ai.google.dev/gemini-api/docs/google-search
"""
from datetime import datetime, timezone
from urllib.parse import urlparse

import gemini_client as client
import gemini_service as service
from gemini_client import ServiceError

STRING = {"type": "STRING"}
SEARCH_TOOL = [{"google_search": {}}]
MAX_SOURCES = 8


def _sources(candidate):
    """Pages and searches Google reports for this answer."""
    metadata = candidate.get("groundingMetadata") or {}

    sources, seen = [], set()
    for chunk in metadata.get("groundingChunks") or []:
        web = chunk.get("web") or {}
        url = web.get("uri")
        if not isinstance(url, str) or urlparse(url).scheme not in ("http", "https") or url in seen:
            continue
        seen.add(url)
        sources.append({"title": str(web.get("title") or urlparse(url).netloc)[:120], "url": url})

    queries = [q for q in metadata.get("webSearchQueries") or [] if isinstance(q, str)]
    return sources[:MAX_SOURCES], queries[:6]


def _research(keyboard):
    name = keyboard["keyboard_name"]
    brand = keyboard.get("brand") or ""
    candidate = client.call(
        "Use Google Search to find what customers and reviewers say about this exact keyboard "
        "model. Report recurring praise, recurring complaints, and any average star rating "
        "with the number of ratings and the site it comes from. Quote numbers only when a "
        "page states them. If you cannot find feedback on this exact model, say so plainly.",
        [client.user_turn({"text": f"Keyboard: {name}\nSold by: {brand}"})],
        tools=SEARCH_TOOL,
    )
    return client.text_of(candidate), *_sources(candidate)


def _shape(notes):
    schema = {
        "type": "OBJECT",
        "properties": {
            "found": {"type": "BOOLEAN"},
            "summary": STRING,
            "praise": {"type": "ARRAY", "items": STRING},
            "complaints": {"type": "ARRAY", "items": STRING},
            "rating": {"type": "NUMBER", "nullable": True},
            "rating_count": {"type": "INTEGER", "nullable": True},
            "rating_source": {"type": "STRING", "nullable": True},
        },
        "required": ["found", "summary", "praise", "complaints"],
    }
    return client.generate_json(
        "Turn these research notes about one keyboard into the requested fields. Use only the "
        "notes. `found` is false when the notes contain no real feedback on this model. "
        "`summary` is two or three sentences. Give at most four short points each for praise "
        "and complaints. Set rating (out of 5), rating_count and rating_source only when the "
        "notes state them explicitly; otherwise leave them null.",
        [service.as_part({"notes": notes})],
        schema,
    )


def _points(values):
    if not isinstance(values, list):
        return []
    return [service.output_text(value, "point") for value in values[:4]]


def summarize(keyboard):
    """Research one keyboard. Returns a review dict ready for db.save_web_review."""
    notes, sources, queries = _research(keyboard)
    if not notes.strip() or not sources:
        raise ServiceError("Google Search did not return any reviews for this keyboard yet.",
                           404, "reviews_not_found")

    shaped = _shape(notes)
    if shaped.get("found") is not True:
        raise ServiceError("Google Search did not return any reviews for this keyboard yet.",
                           404, "reviews_not_found")

    rating = shaped.get("rating")
    if isinstance(rating, bool) or not isinstance(rating, (int, float)) or not 0 < rating <= 5:
        rating = None

    count = shaped.get("rating_count")
    if rating is None or type(count) is not int or count <= 0:
        count = None

    source_name = shaped.get("rating_source")
    if rating is None or not isinstance(source_name, str) or not source_name.strip():
        source_name = None

    return {
        "summary": service.output_text(shaped.get("summary"), "summary"),
        "praise": _points(shaped.get("praise")),
        "complaints": _points(shaped.get("complaints")),
        "rating": round(float(rating), 1) if rating is not None else None,
        "rating_count": count,
        "rating_source": source_name.strip()[:80] if source_name else None,
        "sources": sources,
        "queries": queries,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
