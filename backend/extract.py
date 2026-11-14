"""Rule-based extraction: turn one shop product into our fixed keyboard schema.

Every shop words its listings differently, so each field is looked up in
several places (tags, variant options, title, description), most reliable first.
Anything the rules can't find is left as None for the optional LLM pass (llm.py).
"""
import html
import re

SIZES = ["40%", "60%", "65%", "75%", "TKL", "96%", "Full-size", "Alice", "Numpad/Macropad"]

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
        return "96%"  # "1800" is the compact full-size layout, the same as 96%
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
    #    (two letters minimum: Corsair's "K65" is a model number, not a size)
    if size := _size_from_words(title):
        return size
    if m := re.search(r"[A-Za-z]{2}-?(40|60|65|75|80|87|96|98)\b|\b(60|65|75|80|96|98|99)\b", title):
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


def extract_connectivity(head, body):
    """head = title, tags and options (trusted); body = description (fallback)."""
    for text in (head, body):
        modes = []
        if re.search(r"tri-?mode|three[- ]mode", text, re.I):
            modes += ["Wired", "Bluetooth", "2.4 GHz"]
        if re.search(r"\bwired\b|usb[- ]?c\b|type-c", text, re.I):
            modes.append("Wired")
        if re.search(r"bluetooth|\bBT\s?5", text, re.I):
            modes.append("Bluetooth")
        if re.search(r"2\.4\s?g(?:hz)?\b|hyperspeed|lightspeed|slipstream", text, re.I):
            modes.append("2.4 GHz")
        if not {"Bluetooth", "2.4 GHz"} & set(modes) and re.search(r"wireless|dual-?mode", text, re.I):
            modes.append("Wireless")
        if modes:
            return " / ".join(m for m in ["Wired", "Bluetooth", "2.4 GHz", "Wireless"] if m in modes)
    return None


def extract_hot_swap(head, body):
    for text in (head, body):
        if re.search(r"(?:not|non)[- ]hot-?swap", text, re.I):
            return False
        if re.search(r"hot-?swap", text, re.I):
            return True
        if text is head and re.search(r"\bsolder", text, re.I):
            return False  # sold as solder-only, with no hot-swap option
    return None


def extract_assembly(head, has_switches=False, default=None):
    kinds = []
    if re.search(r"barebones?", head, re.I):
        kinds.append("Barebones")
    if re.search(r"\bkit\b|\bDIY\b", head, re.I):
        kinds.append("Kit")
    if re.search(r"fully[- ](?:assembled|built)|pre-?built|ready to use", head, re.I):
        kinds.append("Fully built")
    if not kinds and has_switches:
        kinds.append("Fully built")  # sold with switches installed
    return " / ".join(kinds) or default


_SWITCH_TYPES = [
    ("Hall effect", r"hall[- ]effect|magnetic\s+(?:\w+\s+)?(?:switch|keyboard|gaming)"),
    ("Optical", r"\boptical\b|opto-mechanical"),
    ("Electro-capacitive", r"electro-?capacitive|\btopre\b"),
    ("Mecha-membrane", r"mecha-membrane"),
    ("Membrane", r"\bmembrane\b|scissor|rubber dome"),
    ("Mechanical", r"\bmechanical\b|\bMX\b|gateron|kailh|\bcherry\b|hot-?swap"),
]


def extract_switch_type(head, body):
    # the short codes "HE" / "EC" are only trusted in the title, tags and options
    if re.search(r"\bHE\b", head):
        return "Hall effect"
    if re.search(r"\bEC\b", head):
        return "Electro-capacitive"
    for text in (head, body):
        for name, pat in _SWITCH_TYPES:
            if re.search(pat, text, re.I):
                return name
    return None


_WEIGHT = re.compile(
    r"\b(?:weight|weighs)\b[^.\d]{0,40}?(\d+(?:\.\d+)?)(?:\s*[-–~]\s*\d+(?:\.\d+)?)?\s*"
    r"(kg|kilograms?|g|grams?|lbs?|pounds?|oz)\b", re.I)
_GRAMS_PER = {"k": 1000, "g": 1, "l": 453.6, "p": 453.6, "o": 28.35}


def extract_weight(body, variants=()):
    """Return (grams, source). 'stated' = the listing says it; 'shipping' = the
    shop's shipping weight, which includes packaging."""
    for m in _WEIGHT.finditer(body):
        grams = float(m.group(1)) * _GRAMS_PER[m.group(2)[0].lower()]
        if 150 <= grams <= 6000:
            return round(grams), "stated"
    shipping = [v.get("grams") for v in variants if isinstance(v.get("grams"), (int, float))]
    shipping = [g for g in shipping if 150 <= g <= 8000]
    if shipping:
        return round(min(shipping)), "shipping"
    return None, None


def _reseller_brand(vendor, shop_name):
    """Resellers put the maker in the vendor field, mixed with internal labels."""
    vendor = (vendor or "").strip()
    if shop_name.lower() in vendor.lower():
        return shop_name  # "NovelKeys, LLC", "NovelKeys Preorder"
    if not vendor or vendor.startswith("_") or vendor.lower() in ("stocked", "third party", "in stock", "preorder"):
        return None
    return vendor


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
    option_text = " | ".join(f"{o.get('name')}: {', '.join(o.get('values', []))}" for o in options)
    head = f"{title} | {product.get('product_type')} | {', '.join(tags)} | {option_text}"
    switches = extract_switches(tags, options)
    weight_g, weight_source = extract_weight(body, variants)

    return {
        "brand": shop.get("brand") or _reseller_brand(product.get("vendor"), shop["name"]),
        "connectivity": extract_connectivity(head, body),
        "hot_swappable": extract_hot_swap(head, body),
        "assembly": extract_assembly(head, has_switches=bool(switches)),
        "switch_type": extract_switch_type(f"{head} | {', '.join(switches)}", body),
        "weight_g": weight_g,
        "weight_source": weight_source,
        "shop": shop["name"],
        "source_url": f"https://{shop['domain']}/products/{product.get('handle')}",
        "keyboard_name": title,
        "size": extract_size(title, tags, body),
        "built_material": extract_material(tags, options, body),
        "price": min(prices) if prices else None,
        "price_max": max(prices) if prices else None,
        "currency": shop["currency"],
        "switches": switches,
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
