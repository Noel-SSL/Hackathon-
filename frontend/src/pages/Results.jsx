import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";

import GeminiRanker from "../components/GeminiRanker";
import KeyboardCard from "../components/KeyboardCard";
import { useCatalog } from "../context/CatalogContext";
import { request } from "../lib/api";
import {
  buildFilters,
  clearFilter,
  describeChoice,
  hasChoice,
  selectionFromParams,
  toQuery,
} from "../lib/filters";
import styles from "./Results.module.css";

const PAGE_SIZE = 24;

const SORTS = {
  name: { label: "name", sort: "keyboard_name", order: "asc" },
  "price-low": { label: "price, low to high", sort: "price", order: "asc" },
  "price-high": { label: "price, high to low", sort: "price", order: "desc" },
  rating: { label: "customer stars", sort: "rating", order: "desc" },
};

export default function Results() {
  const [params, setParams] = useSearchParams();
  const { facets } = useCatalog();

  const useCase = params.get("use") ?? "";
  const sortKey = SORTS[params.get("sort")] ? params.get("sort") : "name";
  const selection = useMemo(() => selectionFromParams(params), [params]);
  const query = toQuery(selection, { sort: SORTS[sortKey].sort, order: SORTS[sortKey].order });

  const [keyboards, setKeyboards] = useState(null);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [ranking, setRanking] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setKeyboards(null);
    setError("");
    setRanking(null);
    setVisible(PAGE_SIZE);

    request(`/api/keyboards?${query}`, { signal: controller.signal })
      .then((data) => setKeyboards(data.keyboards))
      .catch((problem) => {
        if (!controller.signal.aborted) setError(problem.message);
      });

    return () => controller.abort();
  }, [query]);

  function updateUrl(nextSelection, nextSort = sortKey) {
    setParams(toQuery(nextSelection, { use: useCase, sort: nextSort === "name" ? "" : nextSort }));
  }

  // When Gemini has ranked the first page, its order and notes take over.
  const ordered = useMemo(() => {
    if (!keyboards || !ranking) return keyboards;

    const byId = new Map(keyboards.map((keyboard) => [keyboard.id, keyboard]));
    const ranked = ranking.recommendations.map((item) => byId.get(item.id)).filter(Boolean);
    const rankedIds = new Set(ranked.map((keyboard) => keyboard.id));
    return [...ranked, ...keyboards.filter((keyboard) => !rankedIds.has(keyboard.id))];
  }, [keyboards, ranking]);

  const picks = useMemo(() => {
    const map = new Map();
    ranking?.recommendations.forEach((item, index) =>
      map.set(item.id, { ...item, rank: index + 1 }),
    );
    return map;
  }, [ranking]);

  const activeFilters = facets
    ? buildFilters(facets).filter((filter) => hasChoice(filter, selection))
    : [];
  const shown = ordered?.slice(0, visible) ?? [];

  return (
    <main className="page">
      <header className={styles.header}>
        <div>
          <p className="eyebrow">{useCase ? `${useCase} keyboards` : "all keyboards"}</p>
          <h1>
            {keyboards
              ? `${keyboards.length} ${keyboards.length === 1 ? "match" : "matches"}`
              : "looking…"}
          </h1>
        </div>

        <label className={styles.sort}>
          sort by
          <select value={sortKey} onChange={(event) => updateUrl(selection, event.target.value)}>
            {Object.entries(SORTS).map(([key, option]) => (
              <option key={key} value={key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className={styles.filters}>
        {activeFilters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={styles.chip}
            onClick={() => updateUrl(clearFilter(filter, selection))}
            aria-label={`Remove ${filter.title} filter`}
          >
            <span>{filter.title}</span>
            {describeChoice(filter, selection)}
            <b aria-hidden="true">×</b>
          </button>
        ))}

        <Link className="text-link" to={`/find?${toQuery(selection, { use: useCase })}`}>
          {activeFilters.length ? "edit filters" : "add filters"}
        </Link>
      </div>

      {keyboards?.length > 1 && (
        <GeminiRanker
          keyboards={keyboards.slice(0, PAGE_SIZE)}
          useCase={useCase}
          ranking={ranking}
          onRanked={setRanking}
        />
      )}

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {keyboards?.length === 0 && (
        <div className={styles.empty}>
          <h2>nothing fits all of that.</h2>
          <p>
            {selection.min_rating
              ? "Not every shop publishes star ratings, so that filter hides a lot. Try removing it."
              : "Try removing a filter above to widen the search."}
          </p>
        </div>
      )}

      <div className={styles.grid}>
        {!keyboards &&
          !error &&
          Array.from({ length: 8 }, (_, index) => (
            <div key={index} className={`skeleton ${styles.placeholder}`} />
          ))}

        {shown.map((keyboard, index) => (
          <motion.div
            key={keyboard.id}
            layout
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              layout: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.5, delay: (index % PAGE_SIZE) * 0.035 },
              y: { duration: 0.7, delay: (index % PAGE_SIZE) * 0.035, ease: [0.22, 1, 0.36, 1] },
            }}
          >
            <KeyboardCard keyboard={keyboard} useCase={useCase} pick={picks.get(keyboard.id)} />
          </motion.div>
        ))}
      </div>

      {ordered && visible < ordered.length && (
        <div className={styles.more}>
          <button
            type="button"
            className="button ghost"
            onClick={() => setVisible(visible + PAGE_SIZE)}
          >
            show {Math.min(PAGE_SIZE, ordered.length - visible)} more
          </button>
        </div>
      )}
    </main>
  );
}
