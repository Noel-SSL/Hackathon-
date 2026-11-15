# keydex

Find a keyboard for work or play. Built for DevFest at UCSC (Google Developer Group),
for the **Best Integration of Gemini / Google API** track.

Pick office or gaming, choose a few filters (or let Gemini choose them from a sentence
or a photo), browse real listings scraped from keyboard shops, ask the chatbot anything
about them, and read what buyers say about each one.

## How Gemini is used

Six features depend on Gemini, and between them they use five different parts of the
API. All calls are made by the Python backend; the key never reaches the browser.

| Feature | Where in the app | Gemini capability | Code |
| --- | --- | --- | --- |
| Ask keydex | Chat drawer, every page | Function calling, multi-step, against SQLite | `backend/chat.py` |
| What buyers say | Keyboard page | Structured output over the shop's written reviews | `backend/summarize.py` |
| What buyers say (no shop reviews) | Keyboard page | Grounding with Google Search | `backend/gemini_reviews.py` |
| Describe it | Finder, text bar | Structured output (JSON schema) | `backend/gemini_service.py` |
| Match a photo | Finder, camera button | Image input with structured output | `backend/gemini_vision.py` |
| Rank / "is this right for me?" | Results and keyboard pages | Structured output | `backend/gemini_service.py` |

Things worth pointing out in a demo:

- **Nothing Gemini returns is trusted as-is.** Filters are checked against the values in
  the database, ranked ids must match the ids that were sent, and the chatbot's links are
  dropped unless one of its own tool calls returned them.
- **The chatbot never sees the whole catalog.** It calls `search_keyboards`,
  `get_keyboards` and `get_catalog_info`, and answers from what they return.
- **Reviews are real.** Star ratings and written reviews are read from each shop's product
  page (`backend/ratings.py`). Where a shop has none, Gemini searches Google instead, and
  the links shown are the pages Google reports it used, never text written by the model.

## Run it

You need Python 3.9+ and Node 20+. The backend has no Python dependencies.

```bash
cp .env.example .env        # then paste your key from https://aistudio.google.com/apikey
python3 backend/server.py
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5174. Without a key the catalog, filters and product pages all
work, and the Gemini features explain that they are switched off.

### Filling the catalog

The database lives at `data/keyboards.db`, which is not in git. To build or refresh it:

```bash
python3 backend/scraper.py --ratings --summaries
```

`--ratings` collects star ratings and written reviews, which the "customer stars" filter
needs. `--summaries` has Gemini summarise those reviews. Both can be left off for a
quicker first run.

## Project layout

```
backend/
  server.py           HTTP routes
  db.py               SQLite catalog, search, reviews
  scraper.py          fills the catalog from shop feeds (extract.py, brands.py, llm.py)
  ratings.py          star ratings and written reviews from product pages
  summarize.py        Gemini summaries of those reviews
  chat.py             the function-calling chatbot
  gemini_client.py    shared caller for the routes below
  gemini_service.py   text -> filters, ranking, spec insights
  gemini_vision.py    photo -> filters
  gemini_reviews.py   Google Search grounded review summaries
  test_api.py         API tests with Gemini mocked
frontend/src/
  pages/              Home, Filters, Results, Detail
  components/         cards, chat drawer, Gemini bars, illustrations
  lib/                API client, filter definitions, image resizing
  context/            catalog facets and Gemini status
  styles/theme.css    colours, type, shared classes
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Whether Gemini is configured |
| GET | `/api/facets` | Values each filter can take |
| GET | `/api/keyboards` | Filtered catalog (`size`, `material`, `switch`, `brand`, `shop`, `min_price`, `max_price`, `min_rating`, `sort`, `order`, ...) |
| GET | `/api/keyboards/:id` | One keyboard and its cached web review summary |
| POST | `/api/chat` | `{message, history}` to a markdown reply and keyboard cards |
| POST | `/api/preferences` | `{prompt, use_case}` to filters |
| POST | `/api/vision` | `{image, mime_type, use_case}` to filters |
| POST | `/api/recommendations` | `{keyboard_ids, preferences, use_case}` to a ranking |
| POST | `/api/keyboards/:id/insights` | Plain-language read of the specs |
| POST | `/api/keyboards/:id/reviews` | Review summary from Google Search, with sources |

## Tests

```bash
python3 -m unittest discover -s backend -p 'test_*.py'
cd frontend && npm run build
```

The tests use a temporary database and a mocked Gemini, so they cost nothing to run.

## Notes on the data

Prices and stock are snapshots from when the catalog was scraped; the product page says
so and links to the shop. If a catalog has no brand recorded, the brand filter lists the
shops instead.
