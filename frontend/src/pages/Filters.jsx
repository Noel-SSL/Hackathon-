import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";

import FilterCard from "../components/FilterCard";
import GeminiAssist from "../components/GeminiAssist";
import Icon from "../components/Icon";
import { useCatalog } from "../context/CatalogContext";
import { request } from "../lib/api";
import {
  FILTER_PARAMS,
  buildFilters,
  hasChoice,
  selectionFromParams,
  toQuery,
} from "../lib/filters";
import styles from "./Filters.module.css";

export default function Filters() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { facets, error, retry } = useCatalog();

  const useCase = params.get("use") === "gaming" ? "gaming" : "office";
  const [selection, setSelection] = useState(() => selectionFromParams(params));
  const [count, setCount] = useState(null);

  const filters = useMemo(() => (facets ? buildFilters(facets) : []), [facets]);

  // Live count for the button, so nobody lands on an empty results page by surprise.
  const query = toQuery(selection);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      request(`/api/keyboards?${query}`, { signal: controller.signal })
        .then((data) => setCount(data.count))
        .catch(() => {});
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function applyGeminiFilters(suggested) {
    const next = {};
    for (const key of FILTER_PARAMS) {
      if (suggested[key] != null) next[key] = suggested[key];
    }
    setSelection(next);
  }

  function showResults() {
    navigate(`/keyboards?${toQuery(selection, { use: useCase })}`);
  }

  const picked = filters.filter((filter) => hasChoice(filter, selection)).length;

  return (
    <main className={`page ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">{useCase} · keyboard finder</p>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            make it yours
          </motion.h1>
          <p className={styles.lead}>
            Six ways to find your fit. Pick what matters, leave the rest open.
          </p>
        </div>
      </header>

      <GeminiAssist useCase={useCase} onFilters={applyGeminiFilters} />

      {error && (
        <p className="notice" role="alert">
          {error}{" "}
          <button type="button" className="text-link" onClick={retry}>
            try again
          </button>
        </p>
      )}

      <div className={styles.grid}>
        {filters.map((filter) => (
          <FilterCard
            key={filter.id}
            filter={filter}
            selection={selection}
            onChange={setSelection}
            note={filter.id === "rating" ? ratingNote(facets) : null}
          />
        ))}

        {!facets &&
          !error &&
          Array.from({ length: 6 }, (_, item) => (
            <div key={item} className={`skeleton ${styles.placeholder}`} />
          ))}
      </div>

      <footer className={styles.footer}>
        <Link className="text-link" to="/">
          back to start
        </Link>

        <p className={styles.summary} aria-live="polite">
          {picked === 0 ? "nothing picked yet" : `${picked} of ${filters.length} picked`}
          {picked > 0 && (
            <button type="button" className="text-link" onClick={() => setSelection({})}>
              clear
            </button>
          )}
        </p>

        <button
          type="button"
          className="button"
          onClick={showResults}
          disabled={!facets || Boolean(error) || count === 0}
        >
          {count === null
            ? "show keyboards"
            : count === 0
              ? "no matches"
              : `show ${count} keyboards`}
          <Icon name="arrow" />
        </button>
      </footer>
    </main>
  );
}

function ratingNote(facets) {
  if (!facets) return null;
  if (facets.rated_count === 0) {
    return "Customer ratings aren't available for this catalog yet.";
  }
  return `${facets.rated_count} keyboards have a customer rating on their shop's page.`;
}
