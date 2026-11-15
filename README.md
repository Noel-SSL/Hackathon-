# Keyboard Finder · DevFest UCSC

A keyboard discovery experience with an office/gaming landing page, illustrated filters,
a real catalog, product details, and live Gemini preference parsing and recommendations.

## Run locally

Open two terminals in the repository root (`Hackathon-`).

**Terminal 1 — Python API** (Python 3.9+; no extra packages needed for browsing or Gemini):

```bash
python3 backend/server.py
```

**Terminal 2 — React website**:

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5173`. Vite forwards `/api` requests
to `http://127.0.0.1:8000`. The Python server serves the API, not the React pages.

## Enable live Gemini

Get an API key from [Google AI Studio](https://aistudio.google.com/apikey). In the terminal
that starts the backend, export the key before launching Python:

```bash
export GEMINI_API_KEY='your-key-here'
export GEMINI_MODEL='gemini-3.8-flash'
python3 backend/server.py
```

Restart the backend after changing these variables. `.env.example` is documentation;
the server does not automatically load `.env` files. Never put the key in a `VITE_`
variable or frontend source. The default model can be overridden with `GEMINI_MODEL`
if your account uses a different model that supports structured output.

Gemini is requested when users explicitly ask for preference suggestions, personalized
ranking, or product insights. Without a key, catalog search continues to work and the
website explains that Gemini is unavailable. A configured key is not proof of valid
permissions or remaining quota; upstream failures produce a retryable message.

## Catalog and review data

The API uses `data/keyboards.db` if it exists, otherwise an existing legacy
`keyboards.db` in the repository root. If neither exists it creates the canonical
catalog. Set `KEYBOARD_DB_PATH` to explicitly choose a catalog. Existing rows are
preserved; missing optional columns are added by the existing schema migration.
A brand missing from an older record falls back to the store name and is labelled
as a store-derived brand in API data (`brand_source: "store"`).

Prices are listed in their source currency. Filtering by currency avoids comparing
unconverted amounts. Catalog prices and availability are snapshots, so confirm them
at the seller before purchasing. There are no invented customer ratings or reviews:
the current catalog has neither. Rating controls stay disabled and details pages
explain that review summaries need real review text. Gemini product insights summarize
catalog specifications, not customer reviews.

Optional catalog refresh uses the existing scraper:

```bash
python3 backend/scraper.py
```

This accesses retailer websites. The existing optional scraper `--llm` mode is separate
from the website's Gemini integration and retains its original Anthropic dependency.

## API

- `GET /api/health` — Gemini configuration status, catalog count, review capabilities.
- `GET /api/facets` — available brands/stores, layouts, materials, switches, currencies.
- `GET /api/keyboards?...` — filtered catalog (`brand`, `size`, `material`, `switch`,
  `min_price`, `max_price`, `currency`, `q`, `sort`, `order`, etc.).
- `GET /api/keyboards/:id` — keyboard detail with empty review metadata.
- `POST /api/preferences` — `{ "prompt": "...", "use_case": "office" }` to editable filters.
- `POST /api/recommendations` — `{ "preferences": "...", "use_case": "gaming",
  "keyboard_ids": [1, 2] }` to ranked IDs, reasons, and tradeoffs (up to 24 candidates).
- `POST /api/keyboards/:id/insights` — optional preferences and use case to catalog insights.

AI requests use Gemini's [structured JSON output](https://ai.google.dev/gemini-api/docs/structured-output)
through the [generateContent REST API](https://ai.google.dev/api/generate-content).
Returned filters and keyboard IDs are validated against the catalog.

## Checks

```bash
python3 -m unittest discover -s backend -p 'test_*.py'
cd frontend
npm run build
```
