"""Multimodal input: a photo of a keyboard or a desk becomes catalog filters.

The browser sends a downsized JPEG/PNG/WebP as base64. Gemini describes what
it can actually see (layout, case material, colours) and picks matching
filters, which are validated the same way as the text feature.

https://ai.google.dev/gemini-api/docs/image-understanding
"""
import base64
import binascii

import gemini_client as client
import gemini_service as service
from gemini_client import ServiceError

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 4 * 1024 * 1024

STRING = {"type": "STRING"}


def _image_part(body):
    mime_type = body.get("mime_type")
    if mime_type not in IMAGE_TYPES:
        raise ServiceError("Please upload a JPEG, PNG or WebP photo.")

    encoded = body.get("image")
    if not isinstance(encoded, str) or not encoded:
        raise ServiceError("Please choose a photo first.")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise ServiceError("The photo could not be read. Please try another one.") from None
    if len(raw) > MAX_IMAGE_BYTES:
        raise ServiceError("That photo is too large. Please use one under 4 MB.", 413)

    return {"inlineData": {"mimeType": mime_type, "data": encoded}}


def from_photo(body, facets):
    image = _image_part(body)
    mode = service.use_case(body.get("use_case", ""))
    note = service.text(body.get("note", ""), "note", maximum=500)

    schema = {
        "type": "OBJECT",
        "properties": {
            "has_keyboard": {"type": "BOOLEAN"},
            "observed": {
                "type": "OBJECT",
                "properties": {
                    "layout": STRING,
                    "case": STRING,
                    "colors": {"type": "ARRAY", "items": STRING},
                    "style": STRING,
                },
                "required": ["layout", "case", "colors", "style"],
            },
            "filters": service.filter_schema(),
            "explanation": STRING,
        },
        "required": ["has_keyboard", "observed", "filters", "explanation"],
    }
    output = client.generate_json(
        "The user shares a photo of a keyboard they like, or of the desk it should fit on. "
        "Describe only what is visible: the layout size judged from the key clusters present "
        "(number pad, arrow keys, function row), the apparent case material, the main colours, "
        "and the overall style in a few words. Then choose catalog filters that would find "
        "similar keyboards, using only values from available_choices. Leave a filter out when "
        "the photo does not show it; never guess a budget, brand or switch from looks alone "
        "unless a logo or legend is clearly readable. If there is no keyboard in the photo, set "
        "has_keyboard to false and base the filters on the space and style of the desk instead.",
        [image, service.as_part({"use_case": mode, "note": note, "available_choices": facets})],
        schema,
    )

    observed = output.get("observed")
    if not isinstance(observed, dict) or not isinstance(observed.get("colors"), list):
        raise ServiceError("Gemini returned an invalid response. Please try again.",
                           502, "gemini_response_invalid")

    return {
        "has_keyboard": output.get("has_keyboard") is True,
        "observed": {
            "layout": service.output_text(observed.get("layout"), "layout"),
            "case": service.output_text(observed.get("case"), "case"),
            "style": service.output_text(observed.get("style"), "style"),
            "colors": [service.output_text(color, "color") for color in observed["colors"][:5]],
        },
        "filters": service.clean_filters(output.get("filters"), facets),
        "explanation": service.output_text(output.get("explanation"), "explanation"),
    }
