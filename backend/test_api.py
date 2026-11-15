"""Behavior checks using a temporary catalog and mocked Gemini, never paid calls."""
import http.client
import json
import os
import sqlite3
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

import db
import gemini_service as gemini
import server


class CatalogAPITest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.path_patch = patch.object(db, "DB_PATH", Path(cls.temp.name) / "test.db")
        cls.path_patch.start()
        conn = db.connect()
        conn.execute("""INSERT INTO keyboards
            (id,shop,source_url,keyboard_name,size,built_material,price,currency,switches,
             available,extracted_by,scraped_at,brand)
            VALUES (1,'Store A','https://example.com/1','Quiet Board','75%','Aluminum',80,
                    'USD','["Silent Linear"]',1,'rules','2026-11-14',NULL)""")
        conn.execute("""INSERT INTO keyboards
            (id,shop,source_url,keyboard_name,size,built_material,price,currency,switches,
             available,extracted_by,scraped_at,brand)
            VALUES (2,'Store B','https://example.com/2','Other Board','65%','Plastic',60,
                    'CAD','["Tactile"]',1,'rules','2026-11-14','Brand B')""")
        conn.commit()
        conn.close()
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)
        cls.path_patch.stop()
        cls.temp.cleanup()

    def request(self, path, body=None, *, method=None, content_type="application/json"):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        try:
            conn.request(method or ("POST" if body is not None else "GET"), path,
                         body=json.dumps(body) if body is not None else None,
                         headers={"Content-Type": content_type})
            response = conn.getresponse()
            return response.status, json.loads(response.read())
        finally:
            conn.close()

    def test_catalog_currency_and_budget_are_hard_filters(self):
        status, data = self.request("/api/keyboards?currency=USD&max_price=90")
        self.assertEqual(status, 200)
        self.assertEqual([item["id"] for item in data["keyboards"]], [1])
        status, data = self.request("/api/keyboards?currency=USD&max_price=70")
        self.assertEqual(data["count"], 0)

    def test_legacy_store_fallback_is_consistent_with_facets(self):
        _, facets = self.request("/api/facets")
        self.assertEqual(facets["brands"], ["Brand B", "Store A"])
        self.assertEqual(facets["currencies"], ["CAD", "USD"])
        self.assertEqual(facets["switches"], ["Silent Linear", "Tactile"])
        _, data = self.request("/api/keyboards?brand=Store%20A")
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["keyboards"][0]["brand_source"], "store")

    def test_detail_and_missing_id(self):
        status, data = self.request("/api/keyboards/1")
        self.assertEqual(status, 200)
        self.assertEqual(data["keyboard"]["id"], 1)
        self.assertEqual(data["reviews"], [])
        self.assertIsNone(data["review_summary"])
        status, data = self.request("/api/keyboards/999")
        self.assertEqual(status, 404)
        self.assertEqual(data["code"], "keyboard_not_found")

    def test_no_key_keeps_catalog_usable_and_ai_honest(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            _, health = self.request("/api/health")
            self.assertFalse(health["gemini_available"])
            self.assertFalse(health["capabilities"]["reviews"])
            self.assertEqual(health["total"], 2)
            status, data = self.request("/api/preferences", {"prompt": "Under 100 dollars"})
            self.assertEqual(status, 503)
            self.assertEqual(data["code"], "gemini_unavailable")
            status, _ = self.request("/api/keyboards")
            self.assertEqual(status, 200)

    def test_input_validation_before_gemini(self):
        with patch.object(gemini, "_generate") as generate:
            self.assertEqual(self.request("/api/preferences", {"prompt": ""})[0], 400)
            self.assertEqual(self.request("/api/preferences", {"prompt": "x" * 4001})[0], 400)
            self.assertEqual(self.request("/api/recommendations", {"keyboard_ids": [True]})[0], 400)
            self.assertEqual(self.request("/api/recommendations", {"keyboard_ids": [1, 1]})[0], 400)
            self.assertEqual(self.request("/api/recommendations", {"keyboard_ids": [999]})[0], 404)
            self.assertEqual(self.request("/api/preferences", ["not an object"])[0], 400)
            self.assertEqual(self.request("/api/preferences", {}, content_type="text/plain")[0], 415)
            generate.assert_not_called()

    def test_invalid_numeric_query_rejected(self):
        for query in ("max_price=NaN", "min_price=-1", "max_price=abc", "min_price=90&max_price=80"):
            self.assertEqual(self.request("/api/keyboards?" + query)[0], 400)

    def test_valid_ai_preference_output(self):
        output = {"filters": {"max_price": 100, "size": "75%", "currency": "USD"},
                  "explanation": "Your budget is 100 USD and you asked for a 75% layout."}
        with patch.object(gemini, "_generate", return_value=output):
            status, data = self.request("/api/preferences", {"prompt": "75% under 100 USD"})
        self.assertEqual(status, 200)
        self.assertEqual(data["filters"]["currency"], "USD")

    def test_ai_cannot_introduce_unavailable_filters(self):
        for filters in ({"size": "999%"}, {"min_rating": 5}, {"max_price": -4},
                        {"max_price": True}, {"min_price": 100, "max_price": 50}):
            with self.subTest(filters=filters), patch.object(gemini, "_generate", return_value={
                    "filters": filters, "explanation": "Suggested filters"}):
                status, data = self.request("/api/preferences", {"prompt": "A compact board"})
                self.assertEqual(status, 502)
                self.assertEqual(data["code"], "gemini_response_invalid")

    def test_ranked_ids_must_match_the_candidate_set(self):
        valid = {"summary": "A useful comparison", "recommendations": [
            {"id": 2, "reason": "Compact layout", "tradeoff": "No number pad"},
            {"id": 1, "reason": "Aluminum housing", "tradeoff": "Weight is unknown"}]}
        with patch.object(gemini, "_generate", return_value=valid):
            status, data = self.request("/api/recommendations", {"keyboard_ids": [1, 2]})
        self.assertEqual(status, 200)
        self.assertEqual([item["id"] for item in data["recommendations"]], [2, 1])
        invalid = {"summary": "Bad comparison", "recommendations": [
            {"id": 999, "reason": "Invented keyboard", "tradeoff": "Unknown"}]}
        with patch.object(gemini, "_generate", return_value=invalid):
            status, data = self.request("/api/recommendations", {"keyboard_ids": [1]})
        self.assertEqual(status, 502)

    def test_insights_are_catalog_based_not_fake_reviews(self):
        with patch.object(gemini, "_generate", return_value={
                "summary": "A compact aluminum board.", "pros": ["75% layout"], "cons": ["Weight unknown"]}):
            status, data = self.request("/api/keyboards/1/insights", {})
        self.assertEqual(status, 200)
        self.assertEqual(data["source"], "catalog")
        self.assertIsNone(data["review_summary"])


class LegacyMigrationTest(unittest.TestCase):
    def test_optional_columns_are_added_without_losing_legacy_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "legacy.db"
            conn = sqlite3.connect(path)
            conn.executescript("""CREATE TABLE keyboards (
                id INTEGER PRIMARY KEY, shop TEXT NOT NULL, source_url TEXT NOT NULL UNIQUE,
                keyboard_name TEXT NOT NULL, size TEXT, built_material TEXT, price REAL,
                price_max REAL, currency TEXT, switches TEXT NOT NULL DEFAULT '[]',
                available INTEGER NOT NULL DEFAULT 0, image_url TEXT, extracted_by TEXT NOT NULL,
                source_updated_at TEXT, scraped_at TEXT NOT NULL);
                INSERT INTO keyboards (id,shop,source_url,keyboard_name,price,currency,
                    extracted_by,scraped_at) VALUES
                    (88,'Legacy Store','https://example.com/legacy','Original keyboard',42,'USD',
                     'rules','2026-01-01');""")
            conn.close()
            with patch.object(db, "DB_PATH", path):
                conn = db.connect()
                try:
                    row = db.get_by_id(conn, 88)
                    self.assertEqual(row["keyboard_name"], "Original keyboard")
                    self.assertEqual(row["price"], 42)
                    self.assertEqual(row["brand_source"], "store")
                    self.assertIsNone(row["connectivity"])
                    self.assertEqual(conn.execute("SELECT COUNT(*) FROM keyboards").fetchone()[0], 1)
                finally:
                    conn.close()


class GeminiTransportTest(unittest.TestCase):
    def test_key_is_only_sent_in_header_and_errors_are_sanitized(self):
        from urllib.error import HTTPError
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret"}), \
                patch.object(gemini.urllib.request, "urlopen", side_effect=HTTPError(
                    "https://example.com?secret=test-secret", 403, "secret=test-secret", None, None)) as opened:
            with self.assertRaises(gemini.ServiceError) as caught:
                gemini._generate("instruction", {}, {"type": "OBJECT"})
            self.assertNotIn("test-secret", str(caught.exception))
            request = opened.call_args.args[0]
            self.assertNotIn("test-secret", request.full_url)
            self.assertEqual(request.get_header("X-goog-api-key"), "test-secret")
            self.assertEqual(json.loads(request.data)["generationConfig"]["responseMimeType"], "application/json")

    def test_blocked_or_invalid_output_fails_cleanly(self):
        from io import BytesIO
        for output in ({"candidates": []}, {"candidates": [{"finishReason": "SAFETY"}]},
                       {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "not json"}]}}]}):
            with self.subTest(output=output), patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret"}), \
                    patch.object(gemini.urllib.request, "urlopen", return_value=BytesIO(json.dumps(output).encode())):
                with self.assertRaises(gemini.ServiceError) as caught:
                    gemini._generate("instruction", {}, {"type": "OBJECT"})
                self.assertEqual(caught.exception.code, "gemini_response_invalid")


if __name__ == "__main__":
    unittest.main()
