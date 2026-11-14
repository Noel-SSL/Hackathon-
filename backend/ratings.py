"""Customer ratings (stars out of 5 and number of reviews).

Shopify's catalogue feed has no reviews, so ratings come from each product's own
page. Only what the page itself shows is used, in any of these forms:
  - schema.org "aggregateRating" (JSON-LD for search engines)
  - the Judge.me review widget's attributes
  - Shopify's standard reviews metafield, which some themes print into the page
Shops whose reviews load only through JavaScript widgets (Yotpo, Bazaarvoice, ...)
show no rating in the page, so they are not listed in RATING_SHOPS.
"""
import json
import re
import time
import urllib.error
from datetime import datetime, timedelta, timezone

import brands

# Shopify shops whose product pages contain a rating in one of the forms above.
RATING_SHOPS = ["Keychron", "Epomaker", "Glorious", "Divinikey"]
REFRESH_AFTER = timedelta(days=7)

_JUDGE_ME = re.compile(
    r"""class=['"]jdgm-rev-widg['"][^>]*?data-average-rating=['"]([\d.]+)['"]"""
    r"""[^>]*?data-number-of-reviews=['"](\d+)['"]""")
_METAFIELD = re.compile(r"MetafieldReviews\s*=\s*(\{.*?\});")


def _clean(rating, count):
    """Return (rating, count). No reviews -> (None, 0); unknown -> (None, None)."""
    try:
        count = int(float(count)) if count is not None else None
        rating = float(rating) if rating is not None else None
    except (TypeError, ValueError):
        return None, None
    if count == 0 or (rating is not None and not 0 < rating <= 5):
        return None, count
    return (round(rating, 2) if rating is not None else None), count


def from_jsonld(product):
    """Rating from a schema.org Product dict, or (None, None)."""
    agg = product.get("aggregateRating") if isinstance(product, dict) else None
    if not isinstance(agg, dict):
        return None, None
    rating = agg.get("ratingValue")
    try:
        best = float(agg.get("bestRating") or 5)
        rating = float(rating) * 5 / best if best != 5 else rating
    except (TypeError, ValueError):
        pass
    return _clean(rating, agg.get("reviewCount") or agg.get("ratingCount"))


def from_page(page):
    """Rating shown on a product page, or (None, None) if the page shows none."""
    product = brands._jsonld_product(page)
    if product:
        rating, count = from_jsonld(product)
        if count is not None:
            return rating, count
    if m := _JUDGE_ME.search(page):
        return _clean(m.group(1), m.group(2))
    if m := _METAFIELD.search(page):
        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError:
            data = {}
        if "rating_count" in data:
            return _clean((data.get("rating") or {}).get("value"), data["rating_count"])
    return None, None


def refresh(conn, shop_names=None, log=print, should_stop=lambda: False):
    """Fetch ratings for Shopify keyboards whose rating is missing or older than a week."""
    shops = [s for s in RATING_SHOPS if not shop_names or s in shop_names]
    if not shops:
        return 0
    cutoff = (datetime.now(timezone.utc) - REFRESH_AFTER).isoformat(timespec="seconds")
    rows = conn.execute(
        f"SELECT id, shop, source_url FROM keyboards WHERE shop IN ({','.join('?' * len(shops))}) "
        "AND (ratings_checked_at IS NULL OR ratings_checked_at < ?) ORDER BY shop, id",
        [*shops, cutoff]).fetchall()
    log(f"Ratings: {len(rows)} product pages to check")
    done = 0
    for i, row in enumerate(rows, 1):
        if should_stop():
            break
        if i > 1:
            time.sleep(brands.DELAY_SECONDS)
        try:
            rating, count = from_page(brands.fetch_text(row["source_url"]))
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            log(f"Ratings: skipped {row['source_url']} ({e})")
            continue
        conn.execute(
            "UPDATE keyboards SET rating = ?, review_count = ?, ratings_checked_at = ? WHERE id = ?",
            (rating, count, datetime.now(timezone.utc).isoformat(timespec="seconds"), row["id"]))
        done += 1
        if i % 25 == 0:
            conn.commit()
            log(f"Ratings: {i}/{len(rows)} pages checked")
    conn.commit()
    log(f"Ratings: checked {done} keyboards")
    return done
