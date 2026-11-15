import { useEffect, useMemo, useRef, useState } from "react";
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

const STEPS = [
  { title: "the board", text: "Start with how it should look and feel on the desk." },
  { title: "the buy", text: "Then narrow it down by who sells it and what people think." },
];
const FILTERS_PER_STEP = 3;
const AUTO_ADVANCE_MS = 700;

export default function Filters() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { facets, error, retry } = useCatalog();

  const useCase = params.get("use") === "gaming" ? "gaming" : "office";
  const [selection, setSelection] = useState(() => selectionFromParams(params));
  const [step, setStep] = useState(0);
  const [count, setCount] = useState(null);

  const filters = useMemo(() => (facets ? buildFilters(facets) : []), [facets]);
  const pages = [filters.slice(0, FILTERS_PER_STEP), filters.slice(FILTERS_PER_STEP)];

  // Once every filter on the first page has a choice, slide to the second
  // page on its own. Only the first time, so going back to edit stays put.
  const hasAdvanced = useRef(false);
  const firstPageDone =
    pages[0].length > 0 && pages[0].every((filter) => hasChoice(filter, selection));

  useEffect(() => {
    if (step !== 0 || !firstPageDone || hasAdvanced.current) return;

    const timer = setTimeout(() => {
      hasAdvanced.current = true;
      setStep(1);
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [step, firstPageDone, selection]);

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
  const onLastStep = step === STEPS.length - 1;

  return (
    <main className="page">
      <header className={styles.header}>
        <div>
          <p className="eyebrow">
            {useCase} · step {step + 1} of {STEPS.length}
          </p>
          <motion.h1
            key={step}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            {STEPS[step].title}
          </motion.h1>
          <p className={styles.lead}>{STEPS[step].text}</p>
        </div>

        <div className={styles.progress} role="tablist" aria-label="Filter steps">
          {STEPS.map((item, index) => (
            <button
              key={item.title}
              type="button"
              role="tab"
              aria-selected={index === step}
              className={index <= step ? styles.reached : ""}
              onClick={() => setStep(index)}
            >
              <span>{item.title}</span>
            </button>
          ))}
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

      <div className={styles.viewport}>
        <motion.div
          className={styles.track}
          animate={{ x: `${-step * 100}%` }}
          transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1] }}
        >
          {pages.map((page, index) => (
            <div
              key={index}
              className={styles.pageOfCards}
              aria-hidden={index !== step}
              inert={index !== step}
            >
              {page.map((filter) => (
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
                [0, 1, 2].map((item) => (
                  <div key={item} className={`skeleton ${styles.placeholder}`} />
                ))}
            </div>
          ))}
        </motion.div>
      </div>

      <footer className={styles.footer}>
        {step === 0 ? (
          <Link className="text-link" to="/">
            back to start
          </Link>
        ) : (
          <button type="button" className="text-link" onClick={() => setStep(step - 1)}>
            back to {STEPS[step - 1].title}
          </button>
        )}

        <p className={styles.summary}>
          {picked === 0 ? "nothing picked yet" : `${picked} of ${filters.length} picked`}
          {picked > 0 && (
            <button type="button" className="text-link" onClick={() => setSelection({})}>
              clear
            </button>
          )}
        </p>

        {onLastStep ? (
          <button type="button" className="button" onClick={showResults} disabled={count === 0}>
            {count === null
              ? "show keyboards"
              : count === 0
                ? "no matches"
                : `show ${count} keyboards`}
            <Icon name="arrow" />
          </button>
        ) : (
          <button type="button" className="button" onClick={() => setStep(step + 1)}>
            {firstPageDone ? "next" : "skip ahead"}
            <Icon name="arrow" />
          </button>
        )}
      </footer>
    </main>
  );
}

function ratingNote(facets) {
  if (!facets) return null;
  if (facets.rated_count === 0) {
    return "No ratings in this catalog yet. Run the scraper with --ratings to collect them.";
  }
  return `${facets.rated_count} keyboards have a customer rating on their shop's page.`;
}
