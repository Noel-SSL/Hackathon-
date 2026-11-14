"""Optional LLM pass: fills in fields the rules in extract.py could not find.

Needs `pip install anthropic` and Anthropic credentials (ANTHROPIC_API_KEY or
an `ant auth login` profile). The scraper works without it.
"""
import json
import os

from extract import MATERIALS, SIZES

MODEL = os.environ.get("KEYBOARD_LLM_MODEL", "claude-opus-5-5")

_MATERIAL_NAMES = [name for name, _ in MATERIALS] + ["Metal"]

SCHEMA = {
    "type": "object",
    "properties": {
        "size": {"type": "string", "enum": SIZES + ["unknown"]},
        "case_materials": {
            "type": "array",
            "items": {"type": "string", "enum": _MATERIAL_NAMES},
        },
        "switches": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["size", "case_materials", "switches"],
    "additionalProperties": False,
}

SYSTEM = (
    "You extract mechanical keyboard specifications from shop listings. "
    "Use only what the listing states; never guess from the brand or price.\n"
    "- size: the layout size. 80% and 87-key boards are TKL, 100%/104/108-key are Full-size. "
    "Use \"unknown\" if the listing does not say.\n"
    "- case_materials: materials of the case/housing only, not the plate, keycaps or weight. "
    "Empty list if not stated.\n"
    "- switches: switch options the keyboard ships with, as named in the listing. "
    "Empty list for kits sold without switches."
)


class LLMUnavailable(Exception):
    """The LLM pass can't be used at all (SDK missing, bad credentials)."""


_client = None


def _get_client():
    global _client
    if _client is None:
        try:
            import anthropic
        except ImportError as e:
            raise LLMUnavailable("the anthropic package is not installed (pip install anthropic)") from e
        _client = anthropic.Anthropic()
    return _client


def extract(listing_text):
    """Return {"size", "built_material", "switches"} or None if this listing failed."""
    import anthropic

    client = _get_client()
    request = dict(
        model=MODEL,
        max_tokens=4000,
        system=SYSTEM,
        messages=[{"role": "user", "content": listing_text}],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
    )
    try:
        if MODEL == "claude-opus-5-5":
            # Server-side fallback: if a safety classifier declines the request,
            # the API re-runs it on a fallback model instead of returning a refusal.
            response = client.beta.messages.create(
                betas=["server-side-fallback-2026-07-01"], fallbacks="default", **request)
        else:
            response = client.messages.create(**request)
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError, anthropic.NotFoundError) as e:
        raise LLMUnavailable(f"Anthropic API rejected the request: {e}") from e
    except TypeError as e:  # no credentials found when building the request
        raise LLMUnavailable(f"no Anthropic credentials found: {e}") from e
    except anthropic.RateLimitError:
        return None  # the SDK already retried; skip this listing
    except anthropic.APIStatusError as e:
        if e.status_code == 400:
            raise LLMUnavailable(f"Anthropic API rejected the request: {e}") from e
        return None
    except anthropic.APIConnectionError:
        return None

    if response.stop_reason != "end_turn":  # refusal or max_tokens
        return None
    text = next((b.text for b in response.content if b.type == "text"), None)
    if not text:
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    return {
        "size": None if data["size"] == "unknown" else data["size"],
        "built_material": " / ".join(data["case_materials"]) or None,
        "switches": [s.strip() for s in data["switches"] if s.strip()],
    }
