"""Fetch keyboards from shops and store them in the database.

    python3 scraper.py                 # all shops, rule-based extraction
    python3 scraper.py --shop KBDfans  # one shop
    python3 scraper.py --llm           # also fill gaps with the LLM (see llm.py)

All shops below are Shopify stores, which publish their catalogue as JSON at
/products.json. To add another Shopify shop, add a line to SHOPS.
"""
import argparse
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import db
import extract

SHOPS = [
    {"name": "Keychron", "domain": "www.keychron.com", "currency": "USD"},
    {"name": "KBDfans", "domain": "kbdfans.com", "currency": "USD"},
    {"name": "NovelKeys", "domain": "novelkeys.com", "currency": "USD"},
    {"name": "Divinikey", "domain": "divinikey.com", "currency": "USD"},
    {"name": "CannonKeys", "domain": "cannonkeys.com", "currency": "USD"},
]

USER_AGENT = "Mozilla/5.0 (compatible; keyboard-db/0.1)"
PAGE_SIZE = 250
MAX_PAGES = 40
DELAY_SECONDS = 1.0  # pause between requests to the same shop


def fetch_products(shop, log=print):
    """Yield every product in a Shopify shop's catalogue."""
    for page in range(1, MAX_PAGES + 1):
        url = f"https://{shop['domain']}/products.json?limit={PAGE_SIZE}&page={page}"
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                products = json.load(resp).get("products", [])
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            log(f"{shop['name']}: page {page} failed ({e}), stopping this shop")
            return
        if not products:
            return
        log(f"{shop['name']}: page {page}, {len(products)} products")
        yield from products
        if len(products) < PAGE_SIZE:
            return
        time.sleep(DELAY_SECONDS)


def _fill_gaps_with_llm(rec, product, existing, log):
    """Fill size/material/switches the rules missed. Returns False if the LLM is unusable."""
    import llm

    if not (rec["size"] is None or rec["built_material"] is None):
        return True
    # Unchanged listing that the LLM already handled: reuse instead of paying again.
    if (existing and existing["extracted_by"] == "rules+llm"
            and existing["source_updated_at"] == rec["source_updated_at"]):
        rec["size"] = rec["size"] or existing["size"]
        rec["built_material"] = rec["built_material"] or existing["built_material"]
        rec["switches"] = rec["switches"] or json.loads(existing["switches"])
        rec["extracted_by"] = "rules+llm"
        return True
    try:
        result = llm.extract(extract.llm_context(product))
    except llm.LLMUnavailable as e:
        log(f"LLM pass disabled: {e}")
        return False
    if result is None:
        log(f"LLM pass failed for {rec['keyboard_name']!r}, keeping rule-based values")
        return True
    rec["size"] = rec["size"] or result["size"]
    rec["built_material"] = rec["built_material"] or result["built_material"]
    rec["switches"] = rec["switches"] or result["switches"]
    rec["extracted_by"] = "rules+llm"
    return True


def scrape(shop_names=None, use_llm=False, log=print):
    """Scrape the given shops (default: all). Returns the number of keyboards stored."""
    shops = [s for s in SHOPS if not shop_names or s["name"] in shop_names]
    conn = db.connect()
    total = 0
    try:
        for shop in shops:
            count = 0
            for product in fetch_products(shop, log):
                if not extract.is_keyboard(product):
                    continue
                rec = extract.extract_product(product, shop)
                if rec["price"] is None:
                    continue  # no usable price: not a real listing
                if use_llm:
                    use_llm = _fill_gaps_with_llm(rec, product, db.get_by_url(conn, rec["source_url"]), log)
                rec["scraped_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
                db.upsert(conn, rec)
                count += 1
                if count % 25 == 0:
                    conn.commit()
            conn.commit()
            log(f"{shop['name']}: stored {count} keyboards")
            total += count
    finally:
        conn.close()
    log(f"Done: {total} keyboards stored")
    return total


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scrape keyboard shops into keyboards.db")
    parser.add_argument("--shop", action="append", choices=[s["name"] for s in SHOPS],
                        help="shop to scrape (repeatable, default: all)")
    parser.add_argument("--llm", action="store_true",
                        help="use the Anthropic API to fill fields the rules could not find")
    args = parser.parse_args()
    scrape(args.shop, use_llm=args.llm)
