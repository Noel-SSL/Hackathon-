"""Rule-based extraction: turn one shop product into our fixed keyboard schema.

Every shop words its listings differently, so each field is looked up in
several places (tags, variant options, title, description), most reliable first.
Anything the rules can't find is left as None for the optional LLM pass (llm.py).
"""
import html
import re

SIZES = ["40%", "60%", "65%", "75%", "TKL", "96%", "1800", "Full-size", "Alice", "Numpad/Macropad"]

# (canonical name, pattern) - order decides how mixed materials are listed
MATERIALS = [
    ("Aluminum", r"alumin(?:i)?um"),
    ("Polycarbonate", r"polycarbonate"),
    ("Acrylic", r"acrylic"),
    ("Wood", r"\bwood(?:en)?\b|\bwalnut\b|\bbamboo\b"),
    ("Brass", r"\bbrass\b"),
    ("Stainless steel", r"stainless|\bsteel\b"),
    ("Copper", r"\bcopper\b"),
    ("Titanium", r"\btitanium\b"),
    ("Plastic", r"\bplastic\b|\babs\b|injection[- ]mou?ld"),
]

_NOT_A_KEYBOARD_TYPE = ("addon", "add-on", "component", "parts", "accessor")
_NOT_A_KEYBOARD_TITLE = re.compile(
    r"accessor|\bplates?\b|\bpcbs?\b|reservation|gaskets?\b|add-?ons?\b|\bweights?\b|\bfoams?\b"
    r"|deskmat|\bparts?\b|\b(?:top|bottom|base)$|carrying|\bcase$|\bcables?\b|\bextras?\b"
    r"|components?\b|hardware|\bbars?\b|\btray\b|warehouse finds",
    re.I,
)
_CASE_WORDS = r"\b(?:case|body|housing|frame|chassis|enclosure)\b"
_NO_SWITCH = re.compile(r"^(?:no(?:ne)?\b|without|barebones?|n/a|default title)", re.I)


def clean_text(body_html):
    text = re.sub(r"<(script|style)\b.*?</\1>", " ", body_html or "", flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def is_keyboard(product):
    ptype = (product.get("product_type") or "").lower()
    if "keyboard" not in ptype or any(w in ptype for w in _NOT_A_KEYBOARD_TYPE):
        return False
    return not _NOT_A_KEYBOARD_TITLE.search(product.get("title") or "")


def _size_from_percent(n):
    n = int(n)
    for low, high, size in [(40, 49, "40%"), (60, 63, "60%"), (64, 69, "65%"), (70, 78, "75%"),
                            (80, 89, "TKL"), (90, 99, "96%"), (100, 110, "Full-size")]:
        if low <= n <= high:
            return size
    return None


def _size_from_words(text):
    t = text.lower()
    if m := re.search(r"(\d{2,3})\s*%", t):
        if size := _size_from_percent(m.group(1)):
            return size
    if re.search(r"\btkl\b|tenkeyless", t):
        return "TKL"
    if re.search(r"\b1800\b", t):
        return "1800"
    if re.search(r"\balice\b", t):
        return "Alice"
    if re.search(r"full[- ]?sized?\b", t):
        return "Full-size"
    return None


def extract_size(title, tags, body):
    if re.search(r"key ?pad|macro ?pad|num ?pad|number pad", title, re.I):
        return "Numpad/Macropad"
    # 1. tags, layout-specific ones first ("LayoutSize:75%", "65% Layout", "tkl")
    layout_tags = [t for t in tags if not t.lower().startswith("keycap")]
    layout_tags.sort(key=lambda t: 0 if "layout" in t.lower() else 1)
    for tag in layout_tags:
        if size := _size_from_words(tag):
            return size
    # 2. title: "... 75% ...", "TKL", or model names like "Tofu60", "NK65", "Athena 75"
    if size := _size_from_words(title):
        return size
    if m := re.search(r"[A-Za-z]-?(40|60|65|75|80|87|96|98)\b|\b(60|65|75|80)\b", title):
        return _size_from_percent(m.group(1) or m.group(2))
    # 3. description: only percentages that are clearly about the layout
    if m := re.search(r"(\d{2,3})\s*%\s*(?:layout|keyboard|form|size|compact)", body, re.I):
        if size := _size_from_percent(m.group(1)):
            return size
    if re.search(r"\btkl\b|tenkeyless", body, re.I):
        return "TKL"
    return None


def _materials_in(text, hints=False):
    """Materials named in text. With hints, also read shop shorthand:
    "PC" for polycarbonate and "anodized" finishes, which imply aluminum."""
    found = [name for name, pat in MATERIALS if re.search(pat, text, re.I)]
    if hints:
        if "Polycarbonate" not in found and re.search(r"\bPC\b", text):
            found.append("Polycarbonate")
        if "Aluminum" not in found and re.search(r"anodi[sz]ed", text, re.I):
            found.append("Aluminum")
    return [name for name, _ in MATERIALS if name in found]


_MATERIAL_LABEL = re.compile(
    r"\b(?:(?:case|body|housing|frame|chassis)\s+materials?|build)\s*[:：]\s*([^:：]{0,60})", re.I)
_NOT_CASE_OPTION = re.compile(r"plate|pcb|keycap|weight|buffer|switch|badge", re.I)
# Weights and badges are often brass/copper/steel, so a loose mention says nothing about the case.
_BODY_MATERIALS = [(n, p) for n, p in MATERIALS if n not in ("Brass", "Copper", "Stainless steel")]


def extract_material(tags, options, body):
    # 1. explicit tag, e.g. Keychron's "CaseMaterial:Plastic"
    for tag in tags:
        if tag.lower().startswith("casematerial:"):
            value = tag.split(":", 1)[1].strip()
            found = _materials_in(value)
            if found:
                return " / ".join(found)
            return "Metal" if "metal" in value.lower() else value
    # 2. a labelled spec line in the description: "Case material: Aluminum", "Build: ABS"
    if m := _MATERIAL_LABEL.search(body):
        parts = [p for p in re.split(r"[,;]", m.group(1)) if not _NOT_CASE_OPTION.search(p)]
        if found := _materials_in(" ".join(parts), hints=True):
            return " / ".join(found)
    # 3. variant options about the case or its colour ("Case", "Top case", "Color": "PC white")
    values = []
    for opt in options:
        name = opt.get("name", "")
        if re.search(r"case|material|housing|frame|colou?r", name, re.I) and not _NOT_CASE_OPTION.search(name):
            # drop bracketed asides such as "(with brass badge)"
            values += [re.sub(r"[(（\[].*?[)）\]]", " ", v) for v in opt.get("values", [])]
    if found := _materials_in(" ".join(values), hints=True):
        return " / ".join(found)
    # 4. description prose: "aluminum top and bottom case", "case machined from aluminum"
    found = []
    for name, pat in _BODY_MATERIALS:
        near = (rf"(?:{pat})\s+(?:[\w-]+\s+){{0,3}}{_CASE_WORDS}"
                rf"|{_CASE_WORDS}[^.]{{0,30}}\b(?:of|from)\s+(?:[\w-]+\s+){{0,2}}(?:{pat})")
        if re.search(near, body, re.I):
            found.append(name)
    return " / ".join(found) or None


def extract_switches(tags, options):
    switches = []
    for opt in options:
        if re.search(r"switch", opt.get("name", ""), re.I):
            for value in opt.get("values", []):
                value = value.strip()
                if value and not _NO_SWITCH.match(value) and value not in switches:
                    switches.append(value)
    if not switches:
        for tag in tags:
            if tag.lower().startswith("switchtype:"):
                switches.append(tag.split(":", 1)[1].strip())
    return switches


def extract_product(product, shop):
    """Map one Shopify product dict onto our schema. Fields may be None."""
    title = (product.get("title") or "").strip()
    tags = product.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",")]
    options = product.get("options") or []
    body = clean_text(product.get("body_html"))
    variants = product.get("variants") or []

    prices = []
    for v in variants:
        try:
            price = float(v.get("price"))
        except (TypeError, ValueError):
            continue
        if price > 0:
            prices.append(price)
    images = product.get("images") or []

    return {
        "shop": shop["name"],
        "source_url": f"https://{shop['domain']}/products/{product.get('handle')}",
        "keyboard_name": title,
        "size": extract_size(title, tags, body),
        "built_material": extract_material(tags, options, body),
        "price": min(prices) if prices else None,
        "price_max": max(prices) if prices else None,
        "currency": shop["currency"],
        "switches": extract_switches(tags, options),
        "available": any(v.get("available") for v in variants),
        "image_url": images[0].get("src") if images else None,
        "extracted_by": "rules",
        "source_updated_at": product.get("updated_at"),
    }


def llm_context(product):
    """The text the LLM pass sees for one product."""
    options = "\n".join(
        f"- {o.get('name')}: {', '.join(o.get('values', []))}" for o in product.get("options") or [])
    tags = product.get("tags") or []
    if isinstance(tags, list):
        tags = ", ".join(tags)
    return (
        f"Title: {product.get('title')}\n"
        f"Product type: {product.get('product_type')}\n"
        f"Tags: {tags}\n"
        f"Variant options:\n{options}\n"
        f"Description:\n{clean_text(product.get('body_html'))}"
    )
