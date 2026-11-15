"""Customer ratings (stars out of 5 and number of reviews).

Shopify's catalogue feed has no reviews, so ratings come from each product's own
page. Only what the page itself shows is used, in any of these forms:
  - schema.org "aggregateRating" (JSON-LD for search engines)
  - the Judge.me review widget's attributes
  - Shopify's standard reviews metafield, which some themes print into the page
Shops whose reviews load only through JavaScript widgets (Yotpo, Bazaarvoice, ...)
show no rating in the page, so they are not listed in RATING_SHOPS.
"""
import html
import json
import re
import time
import urllib.error
from datetime import datetime, timedelta, timezone

import brands
import db

# Shopify shops whose product pages contain a rating in one of the forms above.
RATING_SHOPS = ["Keychron", "Epomaker", "Glorious", "Divinikey"]
# ...and of those, the ones whose pages also include written reviews.
REVIEW_TEXT_SHOPS = ["Keychron", "Epomaker", "Glorious"]
MAX_REVIEWS = 20  # per keyboard; pages only show the first few anyway

_JUDGE_ME_REVIEW = re.compile(
    r"""<div class=['"]jdgm-rev\b.*?data-score=['"]([\d.]+)['"].*?"""
    r"""<b class=['"]jdgm-rev__title['"]>(.*?)</b>\s*<div class=['"]jdgm-rev__body['"]>(.*?)</div>""", re.S)
_YOTPO_REVIEW = re.compile(
    r"""<article class="yotpo-review"[^>]*data-rating="([\d.]+)"[^>]*>.*?"""
    r"""<h4 class="yotpo-review-title">(.*?)</h4>\s*<p class="yotpo-review-body">(.*?)</p>""", re.S)
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


def _text(fragment):
    text = html.unescape(re.sub(r"<[^>]+>", " ", fragment or ""))
    return re.sub(r"\s+", " ", text).strip().strip('"').strip()


def _review(rating, title, body):
    body, title = _text(body), _text(title)
    if len(body) < 3:
        return None
    try:
        rating = float(rating)
    except (TypeError, ValueError):
        rating = None
    return {"rating": rating, "title": title if title and title != body else None, "body": body[:2000]}


def reviews_from_jsonld(product):
    """Written reviews from a schema.org Product dict (author names are not kept)."""
    items = product.get("review") if isinstance(product, dict) else None
    items = items if isinstance(items, list) else [items] if isinstance(items, dict) else []
    out = []
    for item in items:
        if isinstance(item, dict):
            score = (item.get("reviewRating") or {}).get("ratingValue") if isinstance(item.get("reviewRating"), dict) else None
            if r := _review(score, item.get("headline") or item.get("name"), item.get("reviewBody")):
                out.append(r)
    return out[:MAX_REVIEWS]


def reviews_from_page(page):
    """Written reviews shown on a product page."""
    product = brands._jsonld_product(page)
    found = reviews_from_jsonld(product) if product else []
    if not found:
        for pattern in (_JUDGE_ME_REVIEW, _YOTPO_REVIEW):
            found = [r for m in pattern.findall(page) if (r := _review(*m))]
            if found:
                break
    return found[:MAX_REVIEWS]


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
    marks = ",".join("?" * len(shops))
    text_shops = [s for s in shops if s in REVIEW_TEXT_SHOPS] or [""]
    rows = conn.execute(
        f"SELECT id, shop, source_url FROM keyboards k WHERE shop IN ({marks}) "
        "AND (ratings_checked_at IS NULL OR ratings_checked_at < ? "
        # rated before written reviews were collected: fetch once more for the text
        f" OR (review_count > 0 AND shop IN ({','.join('?' * len(text_shops))}) "
        "     AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.keyboard_id = k.id))) "
        "ORDER BY shop, id",
        [*shops, cutoff, *text_shops]).fetchall()
    log(f"Ratings: {len(rows)} product pages to check")
    done = 0
    for i, row in enumerate(rows, 1):
        if should_stop():
            break
        if i > 1:
            time.sleep(brands.DELAY_SECONDS)
        try:
            page = brands.fetch_text(row["source_url"])
            rating, count = from_page(page)
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            log(f"Ratings: skipped {row['source_url']} ({e})")
            continue
        conn.execute(
            "UPDATE keyboards SET rating = ?, review_count = ?, ratings_checked_at = ? WHERE id = ?",
            (rating, count, datetime.now(timezone.utc).isoformat(timespec="seconds"), row["id"]))
        if count:
            db.save_reviews(conn, row["id"], reviews_from_page(page))
        done += 1
        if i % 25 == 0:
            conn.commit()
            log(f"Ratings: {i}/{len(rows)} pages checked")
    conn.commit()
    log(f"Ratings: checked {done} keyboards")
    return done
