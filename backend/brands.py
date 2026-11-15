"""Non-Shopify brand sites (Razer, Logitech G, SteelSeries, Corsair).

These sites have no catalogue feed, so each one is crawled in two steps:
  1. read a listing page or sitemap and collect product page links
  2. read each product page and pull out the product data

Step 2 relies on the schema.org "Product" JSON-LD block most shops embed for
search engines, so the same parser works across sites. Razer has no such block
and gets a small parser of its own. To add a brand, add an entry to BRANDS.
"""
import gzip
import html
import json
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from urllib.parse import quote, urljoin

import extract
import ratings

USER_AGENT = "Mozilla/5.0 (compatible; keyboard-db/0.1)"
DELAY_SECONDS = 1.0   # pause between product pages on the same site
MAX_PRODUCTS = 150    # per brand, per run

BRANDS = [
    {
        "name": "Razer", "currency": "USD", "parser": "razer",
        "sources": ["https://www.razer.com/gaming-keyboards"],
        "link": r'href="(/gaming-keyboards/[a-z0-9-]+)"',
    },
    {
        "name": "Logitech G", "currency": "USD", "parser": "jsonld",
        "sources": ["https://www.logitechg.com/en-us/shop/c/gaming-keyboards"],
        "link": r'href="(/en-us/shop/p/[^"?#]+)"',
    },
    {
        "name": "SteelSeries", "currency": "USD", "parser": "jsonld",
        "sources": ["https://steelseries.com/gaming-keyboards"],
        "link": r'href="(/gaming-keyboards/[a-z0-9-]+)["?#]',
    },
    {
        "name": "Corsair", "currency": "USD", "parser": "jsonld",
        "sources": ["https://www.corsair.com/us-sitemap-products-1.xml"],
        "link": r"<loc>\s*(https://www\.corsair\.com/us/en/p/keyboards/[^<\s]+)\s*</loc>",
    },
]

_SWITCH_PHRASE = re.compile(r"((?:[A-Z][\w-]*\s+){1,4}Switch(?:es)?)\b")
_SWITCH_TYPES = [
    ("Hall Effect", r"hall[- ]effect"), ("Magnetic", r"\bmagnetic\b"),
    ("Optical", r"\boptical\b|opto-mechanical"), ("Mecha-Membrane", r"mecha-membrane"),
    ("Membrane", r"\bmembrane\b"), ("Mechanical", r"\bmechanical\b"),
]


def fetch_text(url):
    url = quote(url, safe=":/?&=%#+,;@~")  # some sites publish links with stray non-ASCII characters
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xml", "Accept-Encoding": "gzip"}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":  # pages are 1-2 MB uncompressed
            body = gzip.decompress(body)
        return body.decode("utf-8", errors="replace")


def _walk(node):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from _walk(value)
    elif isinstance(node, list):
        for value in node:
            yield from _walk(value)


def _jsonld_product(page):
    """The first schema.org Product object embedded in the page, or None."""
    for m in re.finditer(r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", page, re.S | re.I):
        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        for node in _walk(data):
            types = node.get("@type")
            types = types if isinstance(types, list) else [types]
            if ("Product" in types or "ProductGroup" in types) and node.get("offers"):
                return node
    return None


def _meta(page, prop):
    m = re.search(rf'<meta[^>]+(?:property|name)="{re.escape(prop)}"[^>]*content="([^"]*)"', page)
    return html.unescape(m.group(1)).strip() if m else None


def _number(value):
    try:
        number = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _parse_jsonld(page, url):
    product = _jsonld_product(page)
    if not product:
        return None
    offers = product["offers"]
    offers = offers if isinstance(offers, list) else [offers]
    prices, available, currency = [], False, None
    for offer in offers:
        if not isinstance(offer, dict):
            continue
        for key in ("price", "lowPrice", "highPrice"):
            if (price := _number(offer.get(key))) is not None:
                prices.append(price)
        available = available or "instock" in str(offer.get("availability", "")).lower()
        currency = currency or offer.get("priceCurrency")
    image = product.get("image")
    while isinstance(image, list):
        image = image[0] if image else None
    if isinstance(image, dict):
        image = image.get("url")
    return {
        "name": html.unescape(str(product.get("name") or "")).strip(),
        "category": str(product.get("category") or ""),
        "description": " ".join(filter(None, [str(product.get("description") or ""), _meta(page, "description")])),
        "prices": prices, "available": available, "currency": currency,
        "image": image or _meta(page, "og:image"),
        "rating": ratings.from_jsonld(product),
        "reviews": ratings.reviews_from_jsonld(product),
    }


def _norm(name):
    name = re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()
    return re.sub(r"\btkl\b", "tenkeyless", name)


def _razer_variants(page, url):
    """Razer's marketing pages embed the purchasable variants as JSON
    ("Razer Joro - US", "... - US - White"). Return (name, price, in stock)
    for the variants that are this page's product, matched via the URL slug."""
    want = _norm(url.rstrip("/").rsplit("/", 1)[1])
    variants = []
    for m in re.finditer(r'"price":\{"currencyIso":"USD","formattedValue":"US\$([\d,.]+)"', page):
        names = re.findall(r'"name":"([^"]*)"', page[max(0, m.start() - 600):m.start()])
        price = _number(m.group(1))
        if not names or price is None:
            continue
        base = names[-1].split(" - ")[0].strip()
        if _norm(base) == want:
            stock = re.search(r'"stockLevelStatus":"(\w+)"', page[m.end():m.end() + 600])
            variants.append((base, price, not stock or stock.group(1) != "outOfStock"))
    return variants


def _parse_razer(page, url):
    title = _meta(page, "og:title") or ""
    name = re.sub(r"^Buy\s+", "", title.split("|")[0]).strip()
    summary = re.search(r'"summary":"([^"]*)"', page)
    points = re.search(r'"uniqueSellingPoints":\[(.*?)\]', page)
    description = " ".join(filter(None, [
        summary.group(1) if summary else None,
        ". ".join(re.findall(r'"text":"([^"]*)"', points.group(1))) if points else None,
        _meta(page, "description"),
    ]))
    # Buy pages show one price in the page itself; marketing pages only embed variants.
    m = re.search(r"Product price:\s*</span>\s*US\$([\d,.]+)", page)
    if m and _number(m.group(1)):
        stock = re.search(r'"stockLevelStatus":"(\w+)"', page)
        prices, available = [_number(m.group(1))], bool(stock) and stock.group(1) != "outOfStock"
    else:
        variants = _razer_variants(page, url)
        if variants:
            name = variants[0][0]
        prices, available = [v[1] for v in variants], any(v[2] for v in variants)
    return {
        "name": name, "category": "gaming-keyboards", "description": description,
        "prices": prices, "available": available,
        "currency": "USD", "image": _meta(page, "og:image"),
    }


def extract_switches(text):
    switches = []
    for phrase in _SWITCH_PHRASE.findall(text):
        # keep only the part after the product type: "TKL Gaming Keyboard Optical Switch"
        phrase = re.split(r"\bKeyboards?\b", re.sub(r"\s+", " ", phrase))[-1].strip()
        if " " in phrase and phrase not in switches:
            switches.append(phrase)
    if not switches:  # no named switch: fall back to the switch technology
        for name, pat in _SWITCH_TYPES:
            if re.search(pat, text, re.I):
                return [name]
    return switches


def _rating_fields(rating):
    """Rating columns for a record, only when the page states a review count."""
    if not rating or rating[1] is None:
        return {}
    return {"rating": rating[0], "review_count": rating[1],
            "ratings_checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}


def product_links(site, log):
    links = []
    for source in site["sources"]:
        try:
            page = fetch_text(source)
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            log(f"{site['name']}: could not read {source} ({e})")
            continue
        for link in re.findall(site["link"], page):
            url = urljoin(source, html.unescape(link))
            if url not in links:
                links.append(url)
    return links


def fetch_keyboards(site, log=print):
    """Yield (record, text for the LLM pass) for every keyboard on a brand site."""
    links = product_links(site, log)
    log(f"{site['name']}: {len(links)} product pages found")
    if len(links) > MAX_PRODUCTS:
        log(f"{site['name']}: reading only the first {MAX_PRODUCTS}")
        links = links[:MAX_PRODUCTS]
    parse = _parse_razer if site["parser"] == "razer" else _parse_jsonld
    for i, url in enumerate(links, 1):
        if i > 1:
            time.sleep(DELAY_SECONDS)
        if i % 20 == 0:
            log(f"{site['name']}: {i}/{len(links)} pages read")
        try:
            data = parse(fetch_text(url), url)
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            log(f"{site['name']}: skipped {url} ({e})")
            continue
        if not data or not data["name"] or not data["prices"]:
            continue  # family/landing page or accessory without product data
        if "keyboard" not in f"{url} {data['category']} {data['name']}".lower():
            continue
        name = data["name"]
        if re.search(r"headset|bundle", name, re.I):
            continue  # multi-product bundle, not a single keyboard
        brand = site["name"].split()[0]  # "Logitech G" + "G515 TKL" -> "Logitech G515 TKL"
        if brand.lower() not in name.lower():
            name = f"{brand} {name}"
        text = f"{name}. {data['description']}"
        switches = extract_switches(text)
        weight_g, weight_source = extract.extract_weight(data["description"])
        rec = {
            "brand": brand,
            "connectivity": extract.extract_connectivity(name, data["description"]),
            "hot_swappable": extract.extract_hot_swap(name, data["description"]),
            "assembly": extract.extract_assembly(name, default="Fully built"),
            "switch_type": extract.extract_switch_type(f"{name} | {', '.join(switches)}", data["description"]),
            "weight_g": weight_g,
            "weight_source": weight_source,
            **_rating_fields(data.get("rating")),
            "reviews": data.get("reviews") or [],
            "shop": site["name"],
            "source_url": url,
            "keyboard_name": name,
            "size": extract.extract_size(name, [], data["description"]),
            "built_material": extract.extract_material([], [], data["description"]),
            "price": min(data["prices"]),
            "price_max": max(data["prices"]),
            "currency": data["currency"] or site["currency"],
            "switches": switches,
            "available": data["available"],
            "image_url": data["image"],
            "extracted_by": "rules",
            "source_updated_at": None,
        }
        yield rec, f"Title: {name}\nDescription:\n{data['description']}"
