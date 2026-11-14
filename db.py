"""SQLite storage for the keyboard database."""
import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "keyboards.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS keyboards (
    id                INTEGER PRIMARY KEY,
    shop              TEXT NOT NULL,
    source_url        TEXT NOT NULL UNIQUE,
    keyboard_name     TEXT NOT NULL,
    size              TEXT,
    built_material    TEXT,
    price             REAL,
    price_max         REAL,
    currency          TEXT,
    switches          TEXT NOT NULL DEFAULT '[]',  -- JSON array of switch options
    available         INTEGER NOT NULL DEFAULT 0,
    image_url         TEXT,
    extracted_by      TEXT NOT NULL,               -- 'rules' or 'rules+llm'
    source_updated_at TEXT,
    scraped_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_keyboards_size ON keyboards(size);
CREATE INDEX IF NOT EXISTS idx_keyboards_price ON keyboards(price);
"""

COLUMNS = [
    "shop", "source_url", "keyboard_name", "size", "built_material", "price",
    "price_max", "currency", "switches", "available", "image_url",
    "extracted_by", "source_updated_at", "scraped_at",
]

SORTABLE = {"keyboard_name", "shop", "size", "built_material", "price", "scraped_at"}


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def get_by_url(conn, url):
    return conn.execute("SELECT * FROM keyboards WHERE source_url = ?", (url,)).fetchone()


def upsert(conn, rec):
    row = dict(rec, switches=json.dumps(rec["switches"]), available=int(rec["available"]))
    updates = ", ".join(f"{c} = excluded.{c}" for c in COLUMNS if c != "source_url")
    conn.execute(
        f"INSERT INTO keyboards ({', '.join(COLUMNS)}) "
        f"VALUES ({', '.join(':' + c for c in COLUMNS)}) "
        f"ON CONFLICT(source_url) DO UPDATE SET {updates}",
        row,
    )


def _row_to_dict(row):
    d = dict(row)
    d["switches"] = json.loads(d["switches"])
    d["available"] = bool(d["available"])
    return d


def search(conn, q="", shop="", size="", material="", switch="", min_price=None,
           max_price=None, in_stock=False, sort="keyboard_name", order="asc"):
    where, args = [], []
    if q:
        where.append("keyboard_name LIKE ?")
        args.append(f"%{q}%")
    if shop:
        where.append("shop = ?")
        args.append(shop)
    if size:
        where.append("size IS NULL" if size == "unknown" else "size = ?")
        if size != "unknown":
            args.append(size)
    if material:
        where.append("built_material IS NULL" if material == "unknown" else "built_material LIKE ?")
        if material != "unknown":
            args.append(f"%{material}%")
    if switch:
        where.append("switches LIKE ?")
        args.append(f"%{switch}%")
    if min_price is not None:
        where.append("price >= ?")
        args.append(min_price)
    if max_price is not None:
        where.append("price <= ?")
        args.append(max_price)
    if in_stock:
        where.append("available = 1")
    if sort not in SORTABLE:
        sort = "keyboard_name"
    direction = "DESC" if order == "desc" else "ASC"
    sql = "SELECT * FROM keyboards"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += f" ORDER BY {sort} IS NULL, {sort} COLLATE NOCASE {direction}, id"
    return [_row_to_dict(r) for r in conn.execute(sql, args)]


def facets(conn):
    def col(name):
        return [r[0] for r in conn.execute(
            f"SELECT DISTINCT {name} FROM keyboards WHERE {name} IS NOT NULL ORDER BY {name}")]

    materials = sorted({m for v in col("built_material") for m in v.split(" / ")})
    return {
        "shops": col("shop"),
        "sizes": col("size"),
        "materials": materials,
        "total": conn.execute("SELECT COUNT(*) FROM keyboards").fetchone()[0],
    }
