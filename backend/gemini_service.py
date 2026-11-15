"""Structured-output features: preference parsing, ranking and spec insights.

Each function asks Gemini for JSON that matches a schema, then checks the
answer against the catalog before anything reaches the browser. A filter
value or keyboard id that is not in the database is rejected, not trusted.

https://ai.google.dev/gemini-api/docs/structured-output
"""
import json
import math

import gemini_client as client
from gemini_client import ServiceError

STRING = {"type": "STRING"}

# These are the filters the finder page shows, so Gemini can only set those.
# filter name -> the facet list its value must come from
FACET_FILTERS = {
    "size": "sizes",
    "material": "materials",
    "brand": "brands",
    "shop": "shops",
}
NUMBER_FILTERS = {"min_price": 100000, "max_price": 100000, "min_rating": 5}  # name -> upper limit
MAX_SWITCH_CHARS = 60
FILTER_NAMES = set(FACET_FILTERS) | set(NUMBER_FILTERS) | {"switch"}

# What Gemini gets to see about a keyboard: useful facts, no scraper internals.
CATALOG_FIELDS = (
    "id", "keyboard_name", "brand", "shop", "size", "built_material", "switches",
    "price", "price_max", "currency", "connectivity", "assembly", "switch_type",
    "hot_swappable", "available", "rating", "review_count",
)


def text(value, name, *, required=False, maximum=4000):
    if not isinstance(value, str) or len(value) > maximum:
        raise ServiceError(f"{name} must be text of at most {maximum} characters.")
    if required and not value.strip():
        raise ServiceError(f"Please enter {name}.")
    return value.strip()


def use_case(value):
    if value not in ("", "office", "gaming"):
        raise ServiceError("use_case must be office, gaming, or empty.")
    return value


def output_text(value, name):
    try:
        return text(value, name, required=True, maximum=3000)
    except ServiceError:
        raise ServiceError("Gemini returned an invalid response. Please try again.",
                           502, "gemini_response_invalid") from None


def catalog_record(row):
    return {key: row.get(key) for key in CATALOG_FIELDS}


def as_part(data):
    return {"text": json.dumps(data)}


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------

def filter_schema():
    """Schema for a `filters` object. Shared by the text and chat features."""
    properties = {}
    for field, source in FACET_FILTERS.items():
        # A full enum of every switch name can exceed Gemini's schema limits,
        # so the choices travel in the prompt and are verified in clean_filters.
        properties[field] = {
            "type": "STRING",
            "description": f"Use an exact value from available_choices.{source}, or omit this filter.",
        }
    properties["switch"] = {
        "type": "STRING",
        "description": "A word found in switch names, such as Red, Brown, Blue or Magnetic. "
                       "Omit it unless the user names a switch.",
    }
    for field in NUMBER_FILTERS:
        properties[field] = {"type": "NUMBER", "nullable": True}
    return {"type": "OBJECT", "properties": properties}


def clean_filters(selected, facets):
    """Keep only filters that exist in the catalog. Raises on anything else."""
    invalid = ServiceError("Gemini suggested an unavailable filter. Please try again.",
                           502, "gemini_response_invalid")
    if not isinstance(selected, dict) or selected.keys() - FILTER_NAMES:
        raise invalid

    clean = {}
    for field, value in selected.items():
        if value is None or value == "":
            continue

        if field in FACET_FILTERS:
            if not isinstance(value, str) or value not in facets.get(FACET_FILTERS[field], []):
                raise invalid
        elif field == "switch":
            if not isinstance(value, str) or len(value) > MAX_SWITCH_CHARS:
                raise invalid
            value = value.strip()
        else:
            is_number = isinstance(value, (int, float)) and not isinstance(value, bool)
            if not is_number or not math.isfinite(value) or not 0 <= value <= NUMBER_FILTERS[field]:
                raise invalid

        clean[field] = value

    if "min_price" in clean and "max_price" in clean and clean["min_price"] > clean["max_price"]:
        raise invalid
    return clean


def preferences(body, facets):
    """Plain-language wishes -> catalog filters the visitor can still edit."""
    prompt = text(body.get("prompt", ""), "your keyboard preferences", required=True)
    mode = use_case(body.get("use_case", ""))

    schema = {
        "type": "OBJECT",
        "properties": {"filters": filter_schema(), "explanation": STRING},
        "required": ["filters", "explanation"],
    }
    output = client.generate_json(
        "Translate keyboard preferences into supported catalog filters. Only set filters explicitly "
        "requested or clearly implied by the user's text. Use only the provided facet values; omit "
        "unsupported or unknown preferences. Sound/feel cannot be inferred from switch names alone. "
        "Do not assume all gaming keyboards are mechanical or all office keyboards are silent. "
        "Do not infer a budget or a minimum rating if not given. "
        "Explain the choices and mention preferences the catalog cannot confirm.",
        [as_part({"preferences": prompt, "use_case": mode, "available_choices": facets})],
        schema,
    )
    return {
        "filters": clean_filters(output.get("filters"), facets),
        "explanation": output_text(output.get("explanation"), "explanation"),
    }


# ---------------------------------------------------------------------------
# Ranking
# ---------------------------------------------------------------------------

def keyboard_ids(body):
    ids = body.get("keyboard_ids")
    if not isinstance(ids, list) or not 1 <= len(ids) <= 24:
        raise ServiceError("Choose between 1 and 24 keyboards to compare.")
    if any(type(key) is not int or key <= 0 for key in ids) or len(ids) != len(set(ids)):
        raise ServiceError("keyboard_ids must be unique positive integers.")
    return ids


def recommendations(body, keyboards):
    """Rank the given keyboards, with one reason and one tradeoff for each."""
    prompt = text(body.get("preferences", ""), "preferences")
    mode = use_case(body.get("use_case", ""))
    ids = keyboard_ids(body)
    if {row["id"] for row in keyboards} != set(ids):
        raise ServiceError("One or more keyboards could not be found.", 404, "keyboard_not_found")

    schema = {
        "type": "OBJECT",
        "properties": {
            "summary": STRING,
            "recommendations": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {"id": {"type": "INTEGER"}, "reason": STRING, "tradeoff": STRING},
                    "required": ["id", "reason", "tradeoff"],
                },
            },
        },
        "required": ["summary", "recommendations"],
    }
    output = client.generate_json(
        "Rank every provided keyboard once, from most to least suitable for the user. "
        "All candidates have already passed the user's hard filters. Explain one specific match "
        "and one limitation or unknown for each, using only catalog facts. If there is no personal "
        "preference, give a balanced comparison rather than claiming a personal fit. "
        "A rating is the shop's own customer rating and is missing for many keyboards; "
        "never guess a missing rating.",
        [as_part({"preferences": prompt, "use_case": mode,
                  "keyboards": [catalog_record(row) for row in keyboards]})],
        schema,
    )

    items = output.get("recommendations")
    if not isinstance(items, list) or len(items) != len(ids):
        raise ServiceError("Gemini returned an incomplete comparison. Please try again.",
                           502, "gemini_response_invalid")

    seen = set()
    ranked = []
    for item in items:
        known = isinstance(item, dict) and type(item.get("id")) is int and item["id"] in ids
        if not known or item["id"] in seen:
            raise ServiceError("Gemini returned an unknown keyboard. Please try again.",
                               502, "gemini_response_invalid")
        seen.add(item["id"])
        ranked.append({
            "id": item["id"],
            "reason": output_text(item.get("reason"), "reason"),
            "tradeoff": output_text(item.get("tradeoff"), "tradeoff"),
        })

    return {"recommendations": ranked, "summary": output_text(output.get("summary"), "summary")}


# ---------------------------------------------------------------------------
# Spec insights
# ---------------------------------------------------------------------------

def insights(keyboard, body):
    """Explain one keyboard's listed specs in plain language."""
    prompt = text(body.get("preferences", ""), "preferences")
    mode = use_case(body.get("use_case", ""))

    schema = {
        "type": "OBJECT",
        "properties": {
            "summary": STRING,
            "pros": {"type": "ARRAY", "items": STRING},
            "cons": {"type": "ARRAY", "items": STRING},
        },
        "required": ["summary", "pros", "cons"],
    }
    output = client.generate_json(
        "Explain this keyboard's catalog specifications in plain language for the given use case. "
        "List at most three strengths and three tradeoffs or missing facts. Do not infer typing "
        "sound, latency, quality, or durability from brand or switch names. "
        "This is a specifications summary, never a customer review summary.",
        [as_part({"preferences": prompt, "use_case": mode, "keyboard": catalog_record(keyboard)})],
        schema,
    )

    result = {"summary": output_text(output.get("summary"), "summary"), "source": "catalog"}
    for key in ("pros", "cons"):
        values = output.get(key)
        if not isinstance(values, list) or len(values) > 3:
            raise ServiceError("Gemini returned an invalid summary. Please try again.",
                               502, "gemini_response_invalid")
        result[key] = [output_text(value, key) for value in values]
    return result
