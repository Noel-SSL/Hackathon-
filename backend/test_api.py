"""API checks for the website's routes, using a temporary catalog and a mocked Gemini.

    python3 -m unittest discover -s backend -p 'test_*.py'

Nothing here calls Google, so the tests are free to run.
"""
import http.client
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import chat
import db
import gemini_client as client
import server

KEYBOARDS = [
    # id, shop, name, size, material, price, switches, brand, rating, review_count, summary
    (1, "Store A", "Quiet Board", "75%", "Aluminum", 80, '["Silent Linear"]', "Brand A", None, None, None),
    (2, "Store B", "Other Board", "65%", "Plastic", 60, '["Tactile Brown"]', "Brand B", 4.6, 210,
     "Buyers like the sound."),
]


class WebsiteAPITest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.path_patch = patch.object(db, "DB_PATH", Path(cls.temp.name) / "test.db")
        cls.path_patch.start()

        conn = db.connect()
        conn.executemany(
            "INSERT INTO keyboards (id, shop, keyboard_name, size, built_material, price, switches, "
            "brand, rating, review_count, review_summary, source_url, currency, available, "
            "extracted_by, scraped_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'https://example.com/' || ?, 'USD', 1, "
            "'rules', '2026-11-14')",
            [row + (row[0],) for row in KEYBOARDS])
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

    def request(self, path, body=None, content_type="application/json"):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        try:
            conn.request("POST" if body is not None else "GET", path,
                         body=json.dumps(body) if body is not None else None,
                         headers={"Content-Type": content_type})
            response = conn.getresponse()
            return response.status, json.loads(response.read())
        finally:
            conn.close()

    # ------------------------------------------------------------- catalog

    def test_keyboard_detail_and_missing_id(self):
        status, data = self.request("/api/keyboards/2")
        self.assertEqual(status, 200)
        self.assertEqual(data["keyboard"]["review_summary"], "Buyers like the sound.")
        self.assertIsNone(data["web_review"])

        status, data = self.request("/api/keyboards/999")
        self.assertEqual(status, 404)
        self.assertEqual(data["code"], "keyboard_not_found")

    def test_facets_count_rated_keyboards(self):
        _, facets = self.request("/api/facets")
        self.assertEqual(facets["rated_count"], 1)
        self.assertEqual(facets["brands"], ["Brand A", "Brand B"])

    def test_catalog_works_without_a_key(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            _, health = self.request("/api/health")
            self.assertFalse(health["gemini_available"])
            status, data = self.request("/api/preferences", {"prompt": "Under 100 dollars"})
            self.assertEqual((status, data["code"]), (503, "gemini_unavailable"))
            self.assertEqual(self.request("/api/keyboards?min_rating=4")[1]["count"], 1)

    # ---------------------------------------------------- structured output

    def test_input_is_validated_before_gemini_is_called(self):
        with patch.object(client, "generate_json") as generate:
            self.assertEqual(self.request("/api/preferences", {"prompt": ""})[0], 400)
            self.assertEqual(self.request("/api/preferences", {"prompt": "x" * 4001})[0], 400)
            self.assertEqual(self.request("/api/recommendations", {"keyboard_ids": [True]})[0], 400)
            self.assertEqual(self.request("/api/recommendations", {"keyboard_ids": [1, 1]})[0], 400)
            self.assertEqual(self.request("/api/recommendations", {"keyboard_ids": [999]})[0], 404)
            self.assertEqual(self.request("/api/preferences", {}, content_type="text/plain")[0], 415)
            generate.assert_not_called()

    def test_preferences_become_filters(self):
        answer = {"filters": {"max_price": 100, "size": "75%", "switch": " Brown ", "brand": None},
                  "explanation": "A 75% board under $100 with brown switches."}
        with patch.object(client, "generate_json", return_value=answer):
            status, data = self.request("/api/preferences", {"prompt": "75% under 100, brown switches"})
        self.assertEqual(status, 200)
        self.assertEqual(data["filters"], {"max_price": 100, "size": "75%", "switch": "Brown"})

    def test_gemini_cannot_invent_filters(self):
        for filters in ({"size": "999%"}, {"brand": "Nobody"}, {"colour": "red"}, {"max_price": -4},
                        {"max_price": True}, {"min_rating": 9}, {"min_price": 100, "max_price": 50}):
            answer = {"filters": filters, "explanation": "Suggested filters"}
            with self.subTest(filters=filters), patch.object(client, "generate_json", return_value=answer):
                status, data = self.request("/api/preferences", {"prompt": "A compact board"})
                self.assertEqual((status, data["code"]), (502, "gemini_response_invalid"))

    def test_ranking_must_cover_exactly_the_keyboards_sent(self):
        ranked = {"summary": "A useful comparison", "recommendations": [
            {"id": 2, "reason": "Compact layout", "tradeoff": "No number pad"},
            {"id": 1, "reason": "Aluminum case", "tradeoff": "No rating yet"}]}
        with patch.object(client, "generate_json", return_value=ranked):
            status, data = self.request("/api/recommendations", {"keyboard_ids": [1, 2]})
        self.assertEqual(status, 200)
        self.assertEqual([item["id"] for item in data["recommendations"]], [2, 1])

        invented = {"summary": "Bad", "recommendations": [{"id": 999, "reason": "x", "tradeoff": "y"}]}
        with patch.object(client, "generate_json", return_value=invented):
            self.assertEqual(self.request("/api/recommendations", {"keyboard_ids": [1]})[0], 502)

    def test_spec_insights(self):
        answer = {"summary": "A compact aluminum board.", "pros": ["75% layout"], "cons": ["Weight unknown"]}
        with patch.object(client, "generate_json", return_value=answer):
            status, data = self.request("/api/keyboards/1/insights", {"use_case": "office"})
        self.assertEqual(status, 200)
        self.assertEqual(data["pros"], ["75% layout"])

    # ----------------------------------------------- Google Search grounding

    def test_web_reviews_keep_only_grounded_sources_and_are_cached(self):
        grounded = {"finishReason": "STOP",
                    "content": {"parts": [{"text": "Buyers like the weight. 4.4 stars from 90 ratings."}]},
                    "groundingMetadata": {
                        "webSearchQueries": ["Quiet Board keyboard review"],
                        "groundingChunks": [{"web": {"uri": "https://reviews.example.com/quiet", "title": "Review"}},
                                            {"web": {"uri": "javascript:alert(1)", "title": "Bad"}}]}}
        shaped = {"found": True, "summary": "Buyers like the weight.", "praise": ["Weight"], "complaints": [],
                  "rating": 4.4, "rating_count": 90, "rating_source": "example.com"}
        with patch.object(client, "call", return_value=grounded) as call, \
                patch.object(client, "generate_json", return_value=shaped):
            status, data = self.request("/api/keyboards/1/reviews", {})
            self.assertEqual(call.call_args.kwargs["tools"], [{"google_search": {}}])
            self.request("/api/keyboards/1/reviews", {})
            self.assertEqual(call.call_count, 1)  # the second request came from the cache

        self.assertEqual(status, 200)
        self.assertEqual(data["web_review"]["sources"],
                         [{"title": "Review", "url": "https://reviews.example.com/quiet"}])
        self.assertEqual(self.request("/api/keyboards/1")[1]["web_review"]["rating"], 4.4)
        # A rating found on the web is shown with its source but is not a shop rating.
        self.assertEqual(self.request("/api/keyboards?min_rating=4")[1]["count"], 1)

    def test_web_reviews_without_sources_are_not_stored(self):
        ungrounded = {"finishReason": "STOP", "content": {"parts": [{"text": "People love it."}]}}
        with patch.object(client, "call", return_value=ungrounded):
            status, data = self.request("/api/keyboards/2/reviews", {})
        self.assertEqual((status, data["code"]), (404, "reviews_not_found"))
        self.assertIsNone(self.request("/api/keyboards/2")[1]["web_review"])

    # -------------------------------------------------------------- chatbot

    def chat_models(self, *turns):
        """Patch chat._post to answer with these turns in order; returns the mock."""
        chat._resting.clear()
        chat._no_thinking_level.clear()
        answers = [turn if isinstance(turn, Exception) else
                   {"candidates": [{"finishReason": "STOP", "content": {"role": "model", "parts": turn}}]}
                   for turn in turns]
        env = patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret"})
        post = patch.object(chat, "_post", side_effect=answers)
        env.start()
        self.addCleanup(env.stop)
        self.addCleanup(post.stop)
        return post.start()

    SEARCH = [{"functionCall": {"name": "search_keyboards", "args": {"size": "75%", "max_price": 100}}}]
    ANSWER = [{"text": "Try the [Quiet Board](https://example.com/1) at $80."}]

    def test_chat_answers_from_tool_results(self):
        post = self.chat_models(self.SEARCH, self.ANSWER)
        status, data = self.request("/api/chat", {"message": "a 75% under $100?", "history": []})
        self.assertEqual(status, 200)
        self.assertIn("Quiet Board", data["reply"])
        self.assertEqual([card["id"] for card in data["keyboards"]], [1])
        # Thinking is capped, and no request may outlive the reply's deadline.
        model, body, _key, timeout = post.call_args.args
        self.assertEqual(body["generationConfig"]["thinkingConfig"], {"thinkingLevel": "low"})
        self.assertLessEqual(timeout, chat.API_TIMEOUT_SECONDS)

    def test_chat_stream_reports_progress_then_the_reply(self):
        self.chat_models(self.SEARCH, self.ANSWER)
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        self.addCleanup(conn.close)
        conn.request("POST", "/api/chat", headers={"Content-Type": "application/json"},
                     body=json.dumps({"message": "a 75% under $100?", "stream": True}))
        response = conn.getresponse()
        self.assertEqual(response.status, 200)
        self.assertIn("ndjson", response.getheader("Content-Type"))
        events = [json.loads(line) for line in response.read().decode().splitlines()]
        self.assertEqual([e["text"] for e in events[:-1]],
                         ["Thinking…", "Searching the catalog for 75% under $100…", "Reading the results…"])
        self.assertEqual(events[-1]["type"], "reply")
        self.assertEqual([card["id"] for card in events[-1]["keyboards"]], [1])

    def test_chat_stream_reports_errors_in_the_stream(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
            self.addCleanup(conn.close)
            conn.request("POST", "/api/chat", headers={"Content-Type": "application/json"},
                         body=json.dumps({"message": "hello", "stream": True}))
            events = [json.loads(line) for line in conn.getresponse().read().decode().splitlines()]
        self.assertEqual((events[-1]["type"], events[-1]["status"]), ("error", 503))

    def test_chat_gives_up_at_the_deadline(self):
        from types import SimpleNamespace
        now = [0.0]

        def slow_model(*_args):  # every request uses up 20 seconds, then times out
            now[0] += 20
            raise TimeoutError("timed out")

        post = self.chat_models()
        post.side_effect = slow_model
        clock = SimpleNamespace(monotonic=lambda: now[0], sleep=lambda seconds: None)
        with patch.object(chat, "time", clock):
            status, data = self.request("/api/chat", {"message": "hello"})
        self.assertEqual(status, 502)
        # 45 seconds allow three attempts (20s + 20s + the 5s left); the fourth model is not started.
        self.assertEqual([call.args[3] for call in post.call_args_list], [20, 20, 5])

    def test_chat_retries_without_thinking_level_when_a_model_rejects_it(self):
        from io import BytesIO
        from urllib.error import HTTPError
        rejected = HTTPError("https://example.com", 400, "Bad Request", None, BytesIO(
            json.dumps({"error": {"message": "Thinking level is not supported for this model."}}).encode()))
        post = self.chat_models(rejected, [{"text": "Hello! Ask me about keyboards."}])
        status, data = self.request("/api/chat", {"message": "hello"})
        self.assertEqual((status, data["reply"]), (200, "Hello! Ask me about keyboards."))
        self.assertNotIn("thinkingConfig", post.call_args.args[1]["generationConfig"])



class GeminiTransportTest(unittest.TestCase):
    def test_key_travels_in_a_header_and_errors_do_not_leak_it(self):
        from urllib.error import HTTPError
        failure = HTTPError("https://example.com?secret=test-secret", 403, "secret=test-secret", None, None)
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret"}), \
                patch.dict(client._resting, clear=True), \
                patch.object(client.urllib.request, "urlopen", side_effect=failure) as opened:
            with self.assertRaises(client.ServiceError) as caught:
                client.generate_json("instruction", [{"text": "{}"}], {"type": "OBJECT"})
        self.assertNotIn("test-secret", str(caught.exception))
        request = opened.call_args.args[0]
        self.assertNotIn("test-secret", request.full_url)
        self.assertEqual(request.get_header("X-goog-api-key"), "test-secret")

    def test_a_rate_limited_model_falls_back_to_the_next_one(self):
        from io import BytesIO
        from urllib.error import HTTPError
        answer = {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": '{"ok": true}'}]}}]}
        replies = [HTTPError("https://example.com", 429, "quota", None, None),
                   BytesIO(json.dumps(answer).encode())]
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret", "GEMINI_MODEL": "model-a"}), \
                patch.dict(client._resting, clear=True), \
                patch.object(client.urllib.request, "urlopen", side_effect=replies) as opened:
            result = client.generate_json("instruction", [{"text": "{}"}], {"type": "OBJECT"})
            self.assertEqual(result, {"ok": True})
            tried = [call.args[0].full_url.rsplit("/", 1)[1] for call in opened.call_args_list]
            self.assertEqual(tried, ["model-a:generateContent", "gemini-flash-lite-latest:generateContent"])
            self.assertIn(("model-a", False), client._resting)  # skipped for the next few minutes

    def test_blocked_or_malformed_answers_fail_cleanly(self):
        from io import BytesIO
        for output in ({"candidates": []}, {"candidates": [{"finishReason": "SAFETY"}]},
                       {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "not json"}]}}]}):
            reply = BytesIO(json.dumps(output).encode())
            with self.subTest(output=output), patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret"}), \
                    patch.object(client.urllib.request, "urlopen", return_value=reply):
                with self.assertRaises(client.ServiceError) as caught:
                    client.generate_json("instruction", [{"text": "{}"}], {"type": "OBJECT"})
                self.assertEqual(caught.exception.code, "gemini_response_invalid")


if __name__ == "__main__":
    unittest.main()
