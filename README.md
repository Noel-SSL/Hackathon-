# keydex

Find a keyboard for work or play. Built for DevFest at UCSC (Google Developer Group),
for the **Best Integration of Gemini / Google API** track.

Pick office or gaming, choose a few filters (or let Gemini choose them from a sentence),
browse real listings scraped from keyboard shops, ask the chatbot anything
about them, and read what buyers say about each one.

## How Gemini is used

Five features depend on Gemini, and between them they use three different parts of the
API. All calls are made by the Python backend; the key never reaches the browser.

| Feature | Where in the app | Gemini capability | Code |
| --- | --- | --- | --- |
| Ask keydex | Chat drawer, every page | Function calling, multi-step, against SQLite | `backend/chat.py` |
| What buyers say | Keyboard page | Structured output over the shop's written reviews | `backend/summarize.py` |
| What buyers say (no shop reviews) | Keyboard page | Grounding with Google Search | `backend/gemini_reviews.py` |
| Describe it | Finder, text bar | Structured output (JSON schema) | `backend/gemini_service.py` |
| Rank / "is this right for me?" | Results and keyboard pages | Structured output | `backend/gemini_service.py` |

Things worth pointing out in a demo:

- **Nothing Gemini returns is trusted as-is.** Filters are checked against the values in
  the database, ranked ids must match the ids that were sent, and the chatbot's links are
  dropped unless one of its own tool calls returned them.
- **The chatbot never sees the whole catalog.** It calls `search_keyboards`,
  `get_keyboards` and `get_catalog_info`, and answers from what they return.
- **It keeps working when a model runs out of quota.** Every Gemini call has a list of
  fallback models. A model that is rate-limited, overloaded or not answering is rested for
  a few minutes and the next one is tried.
- **The chatbot shows what it is doing.** Replies stream live progress lines ("Searching
  the catalog…") while the tool calls run, and a whole reply is capped at 45 seconds.
- **Reviews are real.** Star ratings and written reviews are read from each shop's product
  page (`backend/ratings.py`). Where a shop has none, Gemini searches Google instead, and
  the links shown are the pages Google reports it used, never text written by the model.

## Run it

The short version, from a fresh clone:

```bash
cp .env.example .env                 # paste your Gemini key into it
python3 backend/scraper.py           # fill the catalog - a fresh clone has no keyboards
python3 backend/server.py            # API on :8000, leave running
cd frontend && npm install && npm run dev    # second terminal, then open http://localhost:5174
```

The scraper step is not optional the first time: the database is not in git, so until it
has run the site loads but lists nothing. Each step is explained below.

### Requirements

- Python 3.9 or newer. The backend uses only the standard library, so there is nothing to `pip install`.
- Node 20.19+ or 22.12+ (required by Vite 8).
- A Gemini API key from https://aistudio.google.com/apikey. Optional: without one the
  catalog, filters and product pages still work, and the Gemini features say they are
  switched off.

### 1. Clone and add your key

```bash
git clone git@github.com:Noel-SSL/Hackathon-.git
cd Hackathon-
cp .env.example .env        # then paste your key after GEMINI_API_KEY=
```

`.env` is git-ignored. The backend reads it on start, so restart the backend after
changing it.

### 2. Fill the catalog

The database lives at `data/keyboards.db`, which is not in git, so a fresh clone starts
with an empty catalog. Build it once (and rerun any time to refresh prices and stock):

```bash
python3 backend/scraper.py                         # quickest: listings only
python3 backend/scraper.py --ratings --summaries   # full: plus ratings and review summaries
```

| Flag | What it adds | Cost |
| --- | --- | --- |
| `--shop NAME` | Only that shop (repeatable), e.g. `--shop KBDfans` | Faster |
| `--ratings` | Star ratings and written reviews; the "customer stars" filter needs them | One request per keyboard, so much slower. Ratings newer than a week are kept |
| `--summaries` | Gemini summaries of those reviews | Needs `GEMINI_API_KEY`; paced for free-tier rate limits |
| `--llm` | Fills specs the rules missed, using Claude | Needs `pip install anthropic` and `ANTHROPIC_API_KEY` |

The scraper pauses a second between requests to each shop, so a full run takes a while.
It can be stopped and rerun; rows are updated in place.

To add or refresh star ratings for an existing catalog without scraping the listings
again, run the ratings pass on its own:

```bash
python3 backend/ratings.py                   # every supported shop
python3 backend/ratings.py --shop Keychron   # one shop (repeatable)
```

Ratings are read from product pages for Keychron, Epomaker, Glorious and Divinikey (the
shops whose pages publish them) and are rechecked once they are a week old. Keyboards
without published ratings show as "not rated yet".

### 3. Start the backend

```bash
python3 backend/server.py
```

This serves the API on http://127.0.0.1:8000. Leave it running.

### 4. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5174**. Vite forwards `/api` requests to the backend.

### Configuration

All optional except the key, all set in `.env` (real environment variables win):

| Variable | Default | Used by |
| --- | --- | --- |
| `GEMINI_API_KEY` | none | Every Gemini feature |
| `GEMINI_MODEL` | `gemini-3.8-flash` (`gemini-3.5-flash-lite` in `summarize.py`) | Filters, ranking, insights, web reviews, review summaries |
| `KEYBOARD_CHAT_MODEL` | `gemini-3.8-flash` | The chatbot |
| `KEYBOARD_LLM_MODEL` | `claude-opus-5-5` | `scraper.py --llm` only |

If the configured model is rate-limited, overloaded or missing, the backend falls back to
other Flash models on its own (see `FALLBACK_MODELS` in `backend/gemini_client.py` and
`MODELS` in `backend/chat.py`), so a free-tier key keeps working when one model's quota
runs out.

### Other ways to run things

```bash
python3 backend/chat.py "wireless 75% under $100"   # ask the chatbot from the terminal
python3 backend/chat.py                             # interactive chat
python3 backend/summarize.py --shop Epomaker        # (re)summarise reviews for one shop
```

http://127.0.0.1:8000/chat is a bare test page for the chatbot that needs only the backend.

### Troubleshooting

- **Blank page at http://127.0.0.1:8000** - that is the API server. The website is the
  Vite dev server on port 5174.
- **"The keydex server is not reachable"** - the backend is not running, or not on port 8000.
- **No keyboards in the results** - the catalog is empty; run step 2.
- **Gemini features say they are switched off** - `GEMINI_API_KEY` is missing from `.env`,
  or the backend was not restarted after adding it. `curl http://127.0.0.1:8000/api/health`
  shows what the backend sees.
- **Certificate errors from the scraper or `ratings.py` on macOS** - Python cannot find its
  certificate bundle. Point it at the system one:
  `SSL_CERT_FILE=/etc/ssl/cert.pem python3 backend/ratings.py`.
- **A Gemini feature is slow, then works** - the first model was out of quota and a
  fallback took over. That model is skipped for the next few minutes (two for the chatbot,
  ten for the other features).
- **`Address already in use`** - something else is on port 8000 (`lsof -i tcp:8000`). The
  port is set at the top of `backend/server.py`; change the proxy in
  `frontend/vite.config.js` to match.

## Architecture

```
            Browser
               |
               v
   React app (Vite dev server, :5174)        frontend/
               |  /api/* proxied
               v
   Python HTTP server (:8000)                backend/server.py
      |                      |
      | SQL                  | HTTPS, key stays server-side
      v                      v
   SQLite                 Gemini API
   data/keyboards.db      chat.py, gemini_service.py, gemini_reviews.py
      ^                   (via gemini_client.py)
      |
   Scraper (run by hand)                     backend/scraper.py
      1. fetch     Shopify /products.json feeds; brand sites via brands.py
      2. extract   rules in extract.py (optional Claude pass in llm.py)
      3. ratings   stars and reviews from product pages (ratings.py)
      4. summarize Gemini review summaries (summarize.py)
```

There are two halves that only meet at the database:

- **Offline pipeline.** `scraper.py` pulls listings from twelve sources. Eight are Shopify
  stores (Keychron, KBDfans, NovelKeys, Divinikey, CannonKeys, Epomaker, Glorious, HyperX),
  read from their public `/products.json` feed. Four brand sites (Razer, Logitech G,
  SteelSeries, Corsair) have no feed, so `brands.py` crawls their product pages and reads
  the schema.org JSON-LD. `extract.py` normalises every listing into one schema (size,
  case material, switches, connectivity, hot-swap, assembly, weight, price, stock).
  `ratings.py` and `summarize.py` then add reviews and their summaries.
- **Live app.** `server.py` is a single-process `http.server` with no framework. Catalog
  routes (`/api/keyboards`, `/api/facets`) are plain SQL through `db.py`. Gemini routes
  call the Gemini REST API with `urllib` and validate what comes back against the database
  before returning it. `gemini_client.py` is the shared caller: it holds the key, applies
  the model fallback list and turns upstream failures into safe error messages. The
  chatbot (`chat.py`) is a function-calling loop: Gemini asks for `search_keyboards`,
  `get_keyboards` or `get_catalog_info`, the backend runs them against SQLite, and the
  loop repeats until Gemini writes an answer. With `"stream": true` the route answers as
  newline-delimited JSON, sending a status line per step before the reply.
- **Frontend.** A React 19 single-page app with React Router: Home (office or gaming) ->
  Filters (all six on one page) -> Results -> Detail, plus a chat drawer on every page.
  Cards and product pages show customer star ratings where the shop publishes them. It
  holds no secrets and talks only to `/api`.

The database has three tables: `keyboards` (one row per listing, keyed by its shop URL,
with specs, rating and the summary of its shop reviews), `reviews` (the written reviews
behind that summary) and `web_reviews` (cached Google Search grounded summaries for
keyboards whose shop has no reviews). `db.py` creates and migrates them on connect.

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
  gemini_reviews.py   Google Search grounded review summaries
  test_api.py         API tests with Gemini mocked
frontend/src/
  pages/              Home, Filters, Results, Detail
  components/         cards, chat drawer, Gemini bars, illustrations
  lib/                API client, filter definitions
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
| POST | `/api/chat` | `{message, history}` to a markdown reply and keyboard cards; add `"stream": true` for live progress lines (one JSON object per line) |
| POST | `/api/preferences` | `{prompt, use_case}` to filters |
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
